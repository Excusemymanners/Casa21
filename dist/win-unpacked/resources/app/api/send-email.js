const nodemailer = require('nodemailer')
const fs = require('fs')
const path = require('path')

// Optional PDF libraries
let PDFKit = null
try { PDFKit = require('pdfkit') } catch (e) { PDFKit = null }

let PDFLib = null
let PDFLibDocument = null
let pdfLibRgb = null
let pdfLibStandardFonts = null
try {
  PDFLib = require('pdf-lib')
  PDFLibDocument = PDFLib.PDFDocument
  pdfLibRgb = PDFLib.rgb
  pdfLibStandardFonts = PDFLib.StandardFonts
} catch (e) {
  PDFLib = null
}

// Vercel serverless-compatible handler
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { to, subject, text, html, pdfData } = req.body || {}
    if (!to || !subject) return res.status(400).json({ error: 'Missing required fields: to, subject' })

    const host = process.env.SMTP_HOST
    const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS
    const from = process.env.FROM_EMAIL || user
    const disableSmtp = String(process.env.DISABLE_SMTP || 'false').toLowerCase() === 'true'

    let transporter
    let usedEthereal = false
    if (disableSmtp || !host || !user || !pass) {
      const testAccount = await nodemailer.createTestAccount()
      transporter = nodemailer.createTransport({ host: 'smtp.ethereal.email', port: 587, secure: false, auth: { user: testAccount.user, pass: testAccount.pass } })
      usedEthereal = true
    } else {
      const secure = port === 465 || process.env.SMTP_SECURE === 'true'
      transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } })
    }

    const mailOptions = {
      from: from || undefined,
      to,
      subject,
      text: text || undefined,
      html: html || undefined,
      attachments: []
    }

    // Generate or fill PDF when requested
    if (pdfData) {
      // Use template fill if requested and pdf-lib is available
      if (pdfData.template === 'blank' && PDFLibDocument) {
        try {
          // Prefer `public/template.pdf` (as requested). Fallback to legacy name.
          const candidates = [
            path.join(process.cwd(), 'public', 'template.pdf'),
            path.join(process.cwd(), 'public', 'blank (1).pdf')
          ]
          let templatePath = null
          for (const p of candidates) {
            if (fs.existsSync(p)) { templatePath = p; break }
          }
          if (templatePath) {
            const existingPdfBytes = fs.readFileSync(templatePath)
            const pdfDoc = await PDFLibDocument.load(existingPdfBytes)
            const pages = pdfDoc.getPages()
            const firstPage = pages[0]
            const { width, height } = firstPage.getSize()
            const helvetica = await pdfDoc.embedFont(pdfLibStandardFonts.Helvetica)

            // Default placement — adjust later if needed
            const marginLeft = 50
            let currentY = height - 120
            const lineHeight = 18

            const draw = (label, value) => {
              if (!value) return
              firstPage.drawText(`${label}: ${value}`, { x: marginLeft, y: currentY, size: 12, font: helvetica, color: pdfLibRgb(0, 0, 0) })
              currentY -= lineHeight
            }

            draw('Nume', pdfData.clientLastName || pdfData.clientName || '')
            draw('Prenume', pdfData.clientFirstName || '')
            draw('CNP', pdfData.clientCNP || pdfData.cnp || '')
            draw('Serie', pdfData.clientSeries || pdfData.serie || '')
            draw('Adresa', pdfData.clientAddress || pdfData.address || '')
            draw('Job', pdfData.jobName || '')
            draw('Finalizat la', pdfData.completedAt || '')

            const modified = await pdfDoc.save()
            mailOptions.attachments.push({ filename: `${(pdfData.clientLastName || 'client')}_${(pdfData.jobName || 'job')}_filled.pdf`.replace(/[^a-z0-9\-_.]/gi, '_'), content: Buffer.from(modified) })
          } else {
            console.warn('Template not found at', templatePath)
          }
        } catch (err) {
          console.warn('Template filling failed:', err && err.message)
        }

      } else if (PDFKit) {
        // Fallback: generate a simple PDF using pdfkit
        try {
          const buffer = await new Promise((resolve, reject) => {
            const doc = new PDFKit({ size: 'A4', margin: 50 })
            const chunks = []
            doc.on('data', c => chunks.push(c))
            doc.on('end', () => resolve(Buffer.concat(chunks)))
            doc.on('error', err => reject(err))

            doc.fontSize(18).text(pdfData.jobName || 'Job Summary', { align: 'center' })
            doc.moveDown()
            doc.fontSize(12).text(`Client: ${pdfData.clientName || ''}`)
            doc.text(`Client email: ${pdfData.clientEmail || ''}`)
            if (pdfData.clientFirstName || pdfData.clientLastName) doc.text(`Client name parts: ${pdfData.clientFirstName || ''} ${pdfData.clientLastName || ''}`)
            if (pdfData.clientCNP) doc.text(`CNP: ${pdfData.clientCNP}`)
            if (pdfData.clientSeries) doc.text(`Serie: ${pdfData.clientSeries}`)
            if (pdfData.clientAddress) doc.text(`Adresa: ${pdfData.clientAddress}`)
            doc.text(`Completed at: ${pdfData.completedAt || ''}`)
            doc.moveDown()
            doc.fontSize(14).text('Tasks:', { underline: true })
            const tasks = Array.isArray(pdfData.tasks) ? pdfData.tasks : []
            tasks.forEach((t, i) => {
              doc.fontSize(12).text(`${i + 1}. ${t.name || '—'}`)
              if (t.description) doc.text(`   Description: ${t.description}`)
              if (t.value != null) doc.text(`   Value: ${t.value} lei`)
              if (t.estimated_hours != null) doc.text(`   Estimated hours: ${t.estimated_hours}`)
              doc.moveDown(0.5)
            })
            doc.moveDown()
            doc.fontSize(12).text(`Total value: ${pdfData.totalValue != null ? pdfData.totalValue + ' lei' : 'N/A'}`)

            doc.end()
          })
          mailOptions.attachments.push({ filename: `${(pdfData.jobName || 'job').replace(/[^a-z0-9\-]/gi, '_')}_summary.pdf`, content: buffer })
        } catch (err) {
          console.warn('PDF generation failed:', err && err.message)
        }
      }
    }

    const info = await transporter.sendMail(mailOptions)
    const response = { ok: true, messageId: info.messageId }
    if (usedEthereal) response.preview = nodemailer.getTestMessageUrl(info) || null
    return res.status(200).json(response)
  } catch (err) {
    console.error('send-email error', err)
    return res.status(500).json({ error: err.message || 'Failed to send email' })
  }
}

