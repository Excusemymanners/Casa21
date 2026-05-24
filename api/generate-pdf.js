const fs = require('fs')
const path = require('path')

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

let PDFKit = null
try { PDFKit = require('pdfkit') } catch (e) { PDFKit = null }

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { pdfData } = req.body || {}
    if (!pdfData) return res.status(400).json({ error: 'Missing pdfData' })

    // Prefer template fill via pdf-lib
    if (pdfData.template === 'blank' && PDFLibDocument) {
      const candidates = [
        path.join(process.cwd(), 'public', 'template.pdf'),
        path.join(process.cwd(), 'public', 'blank (1).pdf')
      ]
      let templatePath = null
      for (const p of candidates) {
        if (fs.existsSync(p)) { templatePath = p; break }
      }
      if (!templatePath) return res.status(404).json({ error: 'Template not found' })

      const existingPdfBytes = fs.readFileSync(templatePath)
      const pdfDoc = await PDFLibDocument.load(existingPdfBytes)
      const pages = pdfDoc.getPages()
      if (!pages || pages.length === 0) return res.status(400).json({ error: 'Template PDF is empty' })
      
      const firstPage = pages[0]
      const { width, height } = firstPage.getSize()
      if (!Number.isFinite(width) || !Number.isFinite(height)) {
        return res.status(400).json({ error: 'Invalid PDF dimensions' })
      }
      
      // Initialize variables for PDF rendering
      const defaultFontSize = 12
      const marginLeft = 50
      // Try to embed a Unicode-capable TTF font from public/fonts (DejaVu or Noto). Fallback to standard Helvetica.
      let helvetica = null
      try {
        const fontCandidates = [
          path.join(process.cwd(), 'public', 'fonts', 'DejaVuSans.ttf'),
          path.join(process.cwd(), 'public', 'fonts', 'NotoSans-Regular.ttf')
        ]
        let fontPath = null
        for (const p of fontCandidates) if (fs.existsSync(p)) { fontPath = p; break }
        if (fontPath) {
          const fontBytes = fs.readFileSync(fontPath)
          helvetica = await pdfDoc.embedFont(fontBytes)
        }
      } catch (e) {
        helvetica = null
      }
      if (!helvetica) helvetica = await pdfDoc.embedFont(pdfLibStandardFonts.Helvetica)
      const lineHeight = Math.max(12, Math.round(defaultFontSize * 1.6))
      let currentY = height - marginLeft

      // Helper to ensure y value is valid
      const ensureValidY = (y) => {
        if (!Number.isFinite(y)) {
          console.warn('Invalid Y coordinate:', y, 'using currentY:', currentY)
          return currentY
        }
        return y
      }

      // Safe decrement of currentY
      const decrementY = (amount = lineHeight) => {
        const safeAmount = Number.isFinite(amount) ? amount : lineHeight
        currentY = currentY - safeAmount
        if (!Number.isFinite(currentY)) {
          console.warn('currentY became NaN after decrement, resetting to:', height - marginLeft)
          currentY = height - marginLeft
        }
      }

      // Helper to get valid option value
      const getValidOpt = (opts, key, defaultValue) => {
        if (!opts || !Object.prototype.hasOwnProperty.call(opts, key)) return defaultValue
        const val = opts[key]
        if (key === 'y' || key === 'x' || key === 'size' || key === 'width' || key === 'height' || key === 'maxWidth' || key === 'maxHeight') {
          return Number.isFinite(val) ? val : defaultValue
        }
        return val != null ? val : defaultValue
      }

      // Safe drawText wrapper to ensure x/y/size are valid numbers
      const safeDrawText = (page, text, opts = {}, fallbackY = null) => {
        opts = opts || {}
        const size = Number.isFinite(opts.size) ? opts.size : defaultFontSize
        const x = Number.isFinite(opts.x) ? opts.x : marginLeft
        let y = Number.isFinite(opts.y) ? opts.y : (fallbackY != null ? fallbackY : currentY)
        if (!Number.isFinite(y)) {
          console.warn('safeDrawText: invalid y for text', text, 'opts:', opts, 'using fallback', (fallbackY != null ? fallbackY : (height - marginLeft)))
          y = (fallbackY != null ? fallbackY : (height - marginLeft))
        }
        page.drawText(text, { x, y, size, font: helvetica, color: pdfLibRgb(0, 0, 0) })
      }

      // Sanitize fieldBoxes from pdfData to ensure all coordinates are valid
      if (pdfData.fieldBoxes) {
        const sanitizedBoxes = {}
        for (const [key, boxOpts] of Object.entries(pdfData.fieldBoxes)) {
          if (boxOpts && typeof boxOpts === 'object') {
            sanitizedBoxes[key] = {}
            for (const [boxKey, boxValue] of Object.entries(boxOpts)) {
              if (['x', 'y', 'size', 'width', 'height', 'maxWidth', 'maxHeight'].includes(boxKey)) {
                sanitizedBoxes[key][boxKey] = Number.isFinite(boxValue) ? boxValue : undefined
              } else {
                sanitizedBoxes[key][boxKey] = boxValue
              }
            }
          }
        }
        pdfData.fieldBoxes = sanitizedBoxes
      }

      // Sanitize opts object to remove NaN values
      const sanitizeOpts = (opts) => {
        if (!opts || typeof opts !== 'object') return {}
        const sanitized = {}
        for (const [key, val] of Object.entries(opts)) {
          if (['x', 'y', 'size', 'width', 'height', 'maxWidth', 'maxHeight'].includes(key)) {
            // Only keep numeric values
            if (Number.isFinite(val)) {
              sanitized[key] = val
            }
          } else {
            // Keep non-numeric values as is
            sanitized[key] = val
          }
        }
        return sanitized
      }

      // draw simple single-line label + value
      const draw = (label, value, opts = {}) => {
        if (value === undefined || value === null || value === '') return
        opts = sanitizeOpts(opts)
        const size = getValidOpt(opts, 'size', defaultFontSize)
        let x = getValidOpt(opts, 'x', marginLeft)
        x = Number.isFinite(x) ? x : marginLeft
        let y = getValidOpt(opts, 'y', currentY)
        y = ensureValidY(y)
        safeDrawText(firstPage, `${label ? label + ' ' : ''}${value}`, { x, y, size }, /*fallbackY*/ null)
        if (!opts || opts.y == null) decrementY()
      }

      // draw label and wrap value into multiple lines respecting maxWidth and maxHeight
      const drawWrapped = (label, value, opts = {}) => {
        if (value === undefined || value === null || value === '') {
          if (!opts || opts.y == null) decrementY()
          return
        }
        // Sanitize opts immediately at entry
        opts = sanitizeOpts(opts)
        const size = getValidOpt(opts, 'size', defaultFontSize)
        let x = getValidOpt(opts, 'x', marginLeft)
        x = Number.isFinite(x) ? x : marginLeft
        
        // Calculate availWidthTotal with fallback to ensure it's always valid
        let availWidthTotal = width - marginLeft - 50
        if (opts.width != null && Number.isFinite(opts.width)) {
          availWidthTotal = opts.width
        } else if (opts.maxWidth != null && Number.isFinite(opts.maxWidth)) {
          availWidthTotal = opts.maxWidth
        }
        
        // Calculate maxHeight with fallback to ensure it's always valid
        let maxHeight = lineHeight * 4
        if (opts.height != null && Number.isFinite(opts.height)) {
          maxHeight = opts.height
        } else if (opts.maxHeight != null && Number.isFinite(opts.maxHeight)) {
          maxHeight = opts.maxHeight
        }

        const labelText = label ? `${label} ` : ''
        let y = getValidOpt(opts, 'y', currentY)
        y = ensureValidY(y)
        const labelWidth = helvetica.widthOfTextAtSize(labelText, size)
        if (labelText) safeDrawText(firstPage, labelText, { x, y, size }, /*fallbackY*/ null)

        const availWidth = Math.max(20, availWidthTotal - labelWidth)
        const words = String(value).split(/\s+/)
        const lines = []
        let line = ''
        for (const w of words) {
          const test = line ? `${line} ${w}` : w
          const wWidth = helvetica.widthOfTextAtSize(test, size)
          if (wWidth <= availWidth) {
            line = test
          } else {
            if (line) lines.push(line)
            line = w
          }
        }
        if (line) lines.push(line)

        const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight))
        let renderedLines = lines.slice(0, maxLines)
        if (lines.length > maxLines) {
          // truncate last line and add ellipsis
          let last = renderedLines[renderedLines.length - 1]
          while (helvetica.widthOfTextAtSize(`${last}...`, size) > availWidth && last.length > 0) {
            last = last.slice(0, -1)
          }
          renderedLines[renderedLines.length - 1] = `${last}...`
        }

        const startX = x + labelWidth
        for (let i = 0; i < renderedLines.length; i++) {
          const lineY = ensureValidY(y - i * lineHeight)
          safeDrawText(firstPage, renderedLines[i], { x: startX, y: lineY, size }, /*fallbackY*/ null)
        }
        if (!opts || opts.y == null) decrementY(Math.max(lineHeight, renderedLines.length * lineHeight))
      }

      // Helpers to draw on an arbitrary page (page-2). Mirrors drawWrapped/drawField semantics.
      const drawWrappedOn = (page, label, value, opts = {}, pageWidth = width, pageHeight = height) => {
        if (value === undefined || value === null || value === '') return
        // Sanitize opts immediately at entry
        opts = sanitizeOpts(opts)
        const size = getValidOpt(opts, 'size', defaultFontSize)
        let x = getValidOpt(opts, 'x', marginLeft)
        x = Number.isFinite(x) ? x : marginLeft
        
        // Ensure pageWidth and pageHeight are valid
        pageWidth = Number.isFinite(pageWidth) ? pageWidth : width
        pageHeight = Number.isFinite(pageHeight) ? pageHeight : height
        
        let y = getValidOpt(opts, 'y', pageHeight - 120)
        y = ensureValidY(y)
        
        // Calculate availWidthTotal with fallback to ensure it's always valid
        let availWidthTotal = pageWidth - marginLeft - 50
        if (opts.width != null && Number.isFinite(opts.width)) {
          availWidthTotal = opts.width
        } else if (opts.maxWidth != null && Number.isFinite(opts.maxWidth)) {
          availWidthTotal = opts.maxWidth
        }
        
        // Calculate maxHeight with fallback to ensure it's always valid
        let maxHeight = lineHeight * 4
        if (opts.height != null && Number.isFinite(opts.height)) {
          maxHeight = opts.height
        } else if (opts.maxHeight != null && Number.isFinite(opts.maxHeight)) {
          maxHeight = opts.maxHeight
        }

        const labelText = label ? `${label} ` : ''
        const labelWidth = helvetica.widthOfTextAtSize(labelText, size)
          if (labelText) safeDrawText(page, labelText, { x, y, size }, /*fallbackY*/ null)

        const availWidth = Math.max(20, availWidthTotal - labelWidth)
        const words = String(value).split(/\s+/)
        const lines = []
        let line = ''
        for (const w of words) {
          const test = line ? `${line} ${w}` : w
          const wWidth = helvetica.widthOfTextAtSize(test, size)
          if (wWidth <= availWidth) {
            line = test
          } else {
            if (line) lines.push(line)
            line = w
          }
        }
        if (line) lines.push(line)

        const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight))
        let renderedLines = lines.slice(0, maxLines)
        if (lines.length > maxLines) {
          let last = renderedLines[renderedLines.length - 1]
          while (helvetica.widthOfTextAtSize(`${last}...`, size) > availWidth && last.length > 0) {
            last = last.slice(0, -1)
          }
          renderedLines[renderedLines.length - 1] = `${last}...`
        }

        const startX = x + labelWidth
        for (let i = 0; i < renderedLines.length; i++) {
          const lineY = ensureValidY(y - i * lineHeight)
          safeDrawText(page, renderedLines[i], { x: startX, y: lineY, size }, /*fallbackY*/ null)
        }
      }

      const drawFieldOn = (page, fieldKey, label, value, defaultX = marginLeft, defaultY = null, defaultOpts = {}, pageWidth = width, pageHeight = height) => {
        const boxes = pdfData && pdfData.fieldBoxes
        const boxOpts = boxes && (boxes[fieldKey] || boxes[label])
        // Sanitize boxOpts to remove NaN values
        const sanitizedBoxOpts = sanitizeOpts(boxOpts || {})
        const merged = Object.assign({}, defaultOpts, sanitizedBoxOpts)
        
        // Validate and sanitize all merged values
        merged.x = Number.isFinite(merged.x) ? merged.x : (Number.isFinite(defaultX) ? defaultX : marginLeft)
        if (merged.y == null && defaultY != null) merged.y = defaultY
        merged.y = Number.isFinite(merged.y) ? merged.y : undefined
        merged.size = Number.isFinite(merged.size) ? merged.size : undefined
        
        if (pdfData && pdfData.noLabels) merged.noLabel = true

        // special handling for clientSeries
        if (fieldKey === 'clientSeries' && value) {
          const s = String(value)
          const firstPart = s.slice(0, 2)
          const restPart = s.length > 2 ? s.slice(-6) : ''
          let part1X = (merged.part1X != null) ? merged.part1X : ((merged.x != null) ? merged.x : marginLeft)
          part1X = Number.isFinite(part1X) ? part1X : marginLeft
          let part1Y = (merged.part1Y != null && Number.isFinite(merged.part1Y)) ? merged.part1Y : ((merged.y != null && Number.isFinite(merged.y)) ? merged.y : (pageHeight - 120))
          part1Y = ensureValidY(part1Y)
          const baseForOffset = part1X
          let part2X = merged.part2X != null ? merged.part2X : (baseForOffset + (merged.part2Offset != null ? merged.part2Offset : 50))
          part2X = Number.isFinite(part2X) ? part2X : baseForOffset + 50
          let part2Y = (merged.part2Y != null && Number.isFinite(merged.part2Y)) ? merged.part2Y : ((merged.y != null && Number.isFinite(merged.y)) ? merged.y : (pageHeight - 120))
          part2Y = ensureValidY(part2Y)
          const size = merged.size || defaultFontSize
            if (!merged.noLabel && label) {
            safeDrawText(page, `${label} `, { x: part1X, y: part1Y, size }, /*fallbackY*/ pageHeight - 120)
            const lw = helvetica.widthOfTextAtSize(`${label} `, size)
            safeDrawText(page, firstPart, { x: part1X + lw, y: part1Y, size }, /*fallbackY*/ pageHeight - 120)
          } else {
            safeDrawText(page, firstPart, { x: part1X, y: part1Y, size }, /*fallbackY*/ pageHeight - 120)
          }
          if (restPart) safeDrawText(page, restPart, { x: part2X, y: part2Y, size }, /*fallbackY*/ pageHeight - 120)
          return
        }

        if (sanitizedBoxOpts && Object.keys(sanitizedBoxOpts).length > 0) return drawWrappedOn(page, label, value, sanitizedBoxOpts, pageWidth, pageHeight)
        let finalY = (merged.y != null) ? merged.y : (pageHeight - 120)
        finalY = ensureValidY(finalY)
        return safeDrawText(page, `${label ? label + ' ' : ''}${value}`, { x: merged.x, y: finalY, size: (merged.size != null) ? merged.size : defaultFontSize }, /*fallbackY*/ pageHeight - 120)
      }

        // drawField chooses wrapped or simple rendering based on pdfData.fieldBoxes
        const drawField = (fieldKey, label, value) => {
          const boxes = pdfData && pdfData.fieldBoxes
          const boxOpts = boxes && (boxes[fieldKey] || boxes[label])
          const sanitizedBoxOpts = sanitizeOpts(boxOpts || {})
          const merged = Object.assign({}, sanitizedBoxOpts)
          // global no-label flag
          if (pdfData && pdfData.noLabels) merged.noLabel = true

          // special split for series (first 2 chars and last 6 chars)
          if (fieldKey === 'clientSeries' && value) {
            const s = String(value)
            const firstPart = s.slice(0, 2)
            const restPart = s.length > 2 ? s.slice(-6) : ''
            // compute positions: allow explicit part1X/part1Y and part2X/part2Y
            let part1X = (merged.part1X != null && Number.isFinite(merged.part1X)) ? merged.part1X : ((merged.x != null && Number.isFinite(merged.x)) ? merged.x : marginLeft + 520 - marginLeft)
            part1X = Number.isFinite(part1X) ? part1X : marginLeft
            let part1Y = (merged.part1Y != null && Number.isFinite(merged.part1Y)) ? merged.part1Y : ((merged.y != null && Number.isFinite(merged.y)) ? merged.y : currentY)
            part1Y = ensureValidY(part1Y)
            const baseForOffset = part1X
            let part2X = merged.part2X != null && Number.isFinite(merged.part2X) ? merged.part2X : (baseForOffset + (merged.part2Offset != null && Number.isFinite(merged.part2Offset) ? merged.part2Offset : 50))
            part2X = Number.isFinite(part2X) ? part2X : baseForOffset + 50
            let part2Y = (merged.part2Y != null && Number.isFinite(merged.part2Y)) ? merged.part2Y : ((merged.y != null && Number.isFinite(merged.y)) ? merged.y : currentY)
            part2Y = ensureValidY(part2Y)
            const size = merged.size || 12
            if (!merged.noLabel && label) {
              safeDrawText(firstPage, `${label} `, { x: part1X, y: part1Y, size }, /*fallbackY*/ null)
              const lw = helvetica.widthOfTextAtSize(`${label} `, size)
              safeDrawText(firstPage, firstPart, { x: part1X + lw, y: part1Y, size }, /*fallbackY*/ null)
            } else {
              safeDrawText(firstPage, firstPart, { x: part1X, y: part1Y, size }, /*fallbackY*/ null)
            }
            if (restPart) safeDrawText(firstPage, restPart, { x: part2X, y: part2Y, size }, /*fallbackY*/ null)
            if (merged.y == null) decrementY()
            return
          }

          if (sanitizedBoxOpts && Object.keys(sanitizedBoxOpts).length > 0) return drawWrapped(label, value, sanitizedBoxOpts)
          return draw(label, value)
        }

      drawField('clientLastName', '', pdfData.clientLastName || pdfData.clientName || '')
      drawField('clientFirstName', '', pdfData.clientFirstName || '')
      drawField('clientCNP', 'CNP', pdfData.clientCNP || pdfData.cnp || '')
      drawField('clientSeries', 'Serie', pdfData.clientSeries || pdfData.serie || '')
      // Address/location uses configurable box when provided via pdfData.fieldBoxes.clientAddress
      drawField('clientAddress', 'Adresa', pdfData.clientAddress || pdfData.address || '')
      drawField('jobName', 'Job', pdfData.jobName || '')
      drawField('completedAt', 'Finalizat la', pdfData.completedAt || '')
      if (pdfData.receptionNumber) drawField('receptionNumber', 'Numar receptie', String(pdfData.receptionNumber))

      // Final check before saving
      if (!Number.isFinite(currentY)) {
        console.warn('WARNING: currentY is invalid before save:', currentY, 'resetting to', height - marginLeft)
        currentY = height - marginLeft
      }

      const modified = await pdfDoc.save()
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${(pdfData.clientLastName || 'client')}_${(pdfData.jobName || 'job')}_filled.pdf"`)
      return res.status(200).send(Buffer.from(modified))
    }

    // Fallback: generate a simple PDF with pdfkit
      if (PDFKit) {
      // For pdfkit fallback, register a Unicode-capable font if available
      const doc = new PDFKit({ size: 'A4', margin: 50 })
      try {
        const fontCandidates = [
          path.join(process.cwd(), 'public', 'fonts', 'DejaVuSans.ttf'),
          path.join(process.cwd(), 'public', 'fonts', 'NotoSans-Regular.ttf')
        ]
        let fontPath = null
        for (const p of fontCandidates) if (fs.existsSync(p)) { fontPath = p; break }
        if (fontPath) {
          doc.registerFont('UnicodeFont', fontPath)
          doc.font('UnicodeFont')
        }
      } catch (e) {
        // ignore
      }
      const chunks = []
      doc.on('data', c => chunks.push(c))
      doc.on('end', () => {
        const buffer = Buffer.concat(chunks)
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="${(pdfData.jobName || 'job').replace(/[^a-z0-9\-]/gi, '_')}_summary.pdf"`)
        res.status(200).send(buffer)
      })

      doc.fontSize(18).text(pdfData.jobName || 'Job Summary', { align: 'center' })
      doc.moveDown()
      doc.fontSize(12).text(`Client ${pdfData.clientName || ''}`)
      doc.text(`Client email ${pdfData.clientEmail || ''}`)
      if (pdfData.clientFirstName || pdfData.clientLastName) doc.text(`Client name parts ${pdfData.clientFirstName || ''} ${pdfData.clientLastName || ''}`)
      if (pdfData.clientCNP) doc.text(`CNP ${pdfData.clientCNP}`)
      if (pdfData.clientSeries) doc.text(`Serie ${pdfData.clientSeries}`)
      if (pdfData.clientAddress) doc.text(`Adresa ${pdfData.clientAddress}`)
      doc.text(`Completed at ${pdfData.completedAt || ''}`)
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
      return
    }

    return res.status(500).json({ error: 'No PDF generation library available on server' })
  } catch (err) {
    console.error('generate-pdf error', err)
    return res.status(500).json({ error: err.message || 'Failed to generate PDF' })
  }
}
