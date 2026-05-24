import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

async function fetchTemplateBuffer() {
  const candidates = ['/template.pdf', '/blank (1).pdf']
  for (const p of candidates) {
    try {
      const res = await fetch(p)
      if (!res.ok) continue
      const buf = await res.arrayBuffer()
      return buf
    } catch (e) {
      // try next
    }
  }
  return null
}

export async function generateAndDownloadPdf(pdfData) {
  try {
    const normalizeScalar = (value) => {
      if (value === undefined || value === null) return ''
      if (typeof value === 'object') {
        if (value.order_number != null) return String(value.order_number)
        if (value.orderNumber != null) return String(value.orderNumber)
        if (value.value != null) return String(value.value)
        if (value.number != null) return String(value.number)
        if (value.id != null) return String(value.id)
        return ''
      }
      return String(value)
    }

    const tpl = await fetchTemplateBuffer()
    let pdfDoc
    if (tpl) {
      pdfDoc = await PDFDocument.load(tpl)
    } else {
      pdfDoc = await PDFDocument.create()
      pdfDoc.addPage()
    }

    const pages = pdfDoc.getPages()
    const firstPage = pages[0]
    const { width, height } = firstPage.getSize()
    // Try to embed a Unicode-capable TTF font from /public/fonts. Fallback to StandardFonts.Helvetica.
    let helvetica = null
    try {
      const fontResp = await fetch('/fonts/DejaVuSans.ttf')
      if (fontResp.ok) {
        const fontBytes = await fontResp.arrayBuffer()
        helvetica = await pdfDoc.embedFont(fontBytes)
      }
    } catch (e) {
      // ignore and fall back
    }
    if (!helvetica) helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)

    // global/default font size (can be overridden per-field via pdfData.fieldBoxes[...].size)
    const defaultFontSize = (pdfData && pdfData.fontSize) ? Number(pdfData.fontSize) : 12
    const marginLeft = 50
    let currentY = height - 120
    const lineHeight = Math.max(12, Math.round(defaultFontSize * 1.6))

    // Helpers to validate numeric opts and coordinates
    const ensureValidY = (y) => {
      if (!Number.isFinite(y)) {
        console.warn('generatePdfClient: invalid Y coordinate:', y, 'using currentY:', currentY)
        return currentY
      }
      return y
    }

    const sanitizeOpts = (opts) => {
      if (!opts || typeof opts !== 'object') return {}
      const sanitized = {}
      for (const [key, val] of Object.entries(opts)) {
        if (['x', 'y', 'size', 'width', 'height', 'maxWidth', 'maxHeight', 'part1X', 'part1Y', 'part2X', 'part2Y', 'part2Offset', 'part1Offset'].includes(key)) {
          if (Number.isFinite(val)) sanitized[key] = val
        } else {
          sanitized[key] = val
        }
      }
      return sanitized
    }

    const safeDrawText = (page, text, opts = {}, fallbackY = null) => {
      opts = opts || {}
      const size = Number.isFinite(opts.size) ? opts.size : defaultFontSize
      const x = Number.isFinite(opts.x) ? opts.x : marginLeft
      let y = Number.isFinite(opts.y) ? opts.y : (fallbackY != null ? fallbackY : currentY)
      if (!Number.isFinite(y)) {
        console.warn('safeDrawText: invalid y for text', text, 'opts:', opts)
        y = (fallbackY != null ? fallbackY : (height - marginLeft))
      }
      try {
        page.drawText(text, { x, y, size, font: helvetica, color: rgb(0, 0, 0) })
      } catch (err) {
        // Fallback: if font encoding error (WinAnsi), replace problematic unicode arrows and retry
        try {
          const msg = (err && err.message) ? err.message : ''
          if (msg.includes('WinAnsi') || msg.includes('cannot encode')) {
            let safeText = String(text).replace(/\u2937/g, '->')
            // also replace any non-ASCII characters as a last resort
            if (/[^\x00-\x7F]/.test(safeText)) safeText = safeText.replace(/[^\x00-\x7F]/g, '?')
            page.drawText(safeText, { x, y, size, font: helvetica, color: rgb(0, 0, 0) })
            return
          }
        } catch (e2) {
          // fall through to throwing original
        }
        throw err
      }
    }

    const draw = (label, value, opts = {}) => {
      if (value === undefined || value === null || value === '') return
      opts = sanitizeOpts(opts)
      const size = opts.size || defaultFontSize
      const x = Number.isFinite(opts.x) ? opts.x : marginLeft
      let y = Number.isFinite(opts.y) ? opts.y : currentY
      y = ensureValidY(y)
      const text = label ? `${label} ${value}` : `${value}`
      safeDrawText(firstPage, text, { x, y, size }, /*fallbackY*/ null)
      if (opts.y == null) currentY -= lineHeight
    }

    const drawWrapped = (label, value, opts = {}) => {
      if (value === undefined || value === null || value === '') {
        // if using flow placement, still advance
        if (!opts || opts.y == null) currentY -= lineHeight
        return
      }
      opts = sanitizeOpts(opts)
      const size = opts.size || defaultFontSize
      const x = Number.isFinite(opts.x) ? opts.x : marginLeft
      // use provided y or currentY for flow
      let y = Number.isFinite(opts.y) ? opts.y : currentY
      y = ensureValidY(y)
      // prefer explicit width/height if provided, otherwise fall back to maxWidth/maxHeight
      const availWidthTotal = (opts.width != null) ? opts.width : (opts.maxWidth != null ? opts.maxWidth : (width - marginLeft - 50))
      const maxHeight = (opts.height != null) ? opts.height : (opts.maxHeight != null ? opts.maxHeight : (lineHeight * 4))

      const labelText = label ? `${label} ` : ''
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
        let last = renderedLines[renderedLines.length - 1]
        while (helvetica.widthOfTextAtSize(`${last}...`, size) > availWidth && last.length > 0) last = last.slice(0, -1)
        renderedLines[renderedLines.length - 1] = `${last}...`
      }

      const startX = x + labelWidth
      for (let i = 0; i < renderedLines.length; i++) {
        const lineY = ensureValidY(y - i * lineHeight)
        safeDrawText(firstPage, renderedLines[i], { x: startX, y: lineY, size }, /*fallbackY*/ null)
      }
      // advance flow only if we used flow (no explicit y provided)
      if (opts.y == null) currentY -= Math.max(lineHeight, renderedLines.length * lineHeight)
    }

    // Draw a field with per-field defaults. If pdfData.fieldBoxes provides options
    // it will be merged with the defaults. If opts.y is provided, absolute placement
    // is used and flow (currentY) is not advanced; otherwise flow is used.
    const drawFieldAt = (fieldKey, label, value, defaultX = marginLeft, defaultY = null, defaultOpts = {}) => {
      const boxes = pdfData && pdfData.fieldBoxes
      const boxOpts = boxes && (boxes[fieldKey] || boxes[label])
      const merged = Object.assign({}, defaultOpts, boxOpts || {})
      if (merged.x == null) merged.x = defaultX
      if (merged.y == null && defaultY != null) merged.y = defaultY

      // support global or per-field noLabel flag
      const noLabelGlobal = pdfData && pdfData.noLabels
      if (noLabelGlobal) merged.noLabel = true

        // Special handling for series: split into first 2 chars and last 6 chars
        if (fieldKey === 'clientSeries' && value) {
          const s = String(value)
          const firstPart = s.slice(0, 2)
          const restPart = s.length > 2 ? s.slice(-6) : ''
        // compute positions: allow explicit part1X/part1Y and part2X/part2Y
        const part1X = Number.isFinite(merged.part1X) ? merged.part1X : merged.x
        let part1Y = Number.isFinite(merged.part1Y) ? merged.part1Y : merged.y
        part1Y = ensureValidY(part1Y)
        const baseForOffset = (merged.part1X != null ? merged.part1X : merged.x)
        const part2X = Number.isFinite(merged.part2X) ? merged.part2X : (baseForOffset + (Number.isFinite(merged.part2Offset) ? merged.part2Offset : 35))
        let part2Y = Number.isFinite(merged.part2Y) ? merged.part2Y : merged.y
        part2Y = ensureValidY(part2Y)
        const size = merged.size || defaultFontSize
        if (!merged.noLabel && label) {
          safeDrawText(firstPage, `${label} `, { x: part1X, y: part1Y, size }, /*fallbackY*/ null)
          const lw = helvetica.widthOfTextAtSize(`${label} `, size)
          safeDrawText(firstPage, firstPart, { x: part1X + lw, y: part1Y, size }, /*fallbackY*/ null)
        } else {
          safeDrawText(firstPage, firstPart, { x: part1X, y: part1Y, size }, /*fallbackY*/ null)
        }
        if (restPart) safeDrawText(firstPage, restPart, { x: part2X, y: part2Y, size }, /*fallbackY*/ null)
        if (merged.y == null) currentY -= lineHeight
        return
      }

      // If user provided explicit x/y in merged opts, drawWrapped will not advance flow.
      if (boxOpts) return drawWrapped(label, value, merged)

      // No per-field box provided: use flow placement. Pass opts without y so draw/drawWrapped
      // will advance currentY.
      return draw(label, value, merged)
    }

    // Helpers to draw on an arbitrary page (used for page-2). These mirror drawWrapped/drawFieldAt
    const drawWrappedOn = (page, label, value, opts = {}, pageWidth = width, pageHeight = height) => {
      if (value === undefined || value === null || value === '') return
      opts = sanitizeOpts(opts)
      const size = opts.size || defaultFontSize
      const x = Number.isFinite(opts.x) ? opts.x : marginLeft
      let y = Number.isFinite(opts.y) ? opts.y : (pageHeight - 120)
      y = ensureValidY(y)
      const availWidthTotal = (opts.width != null) ? opts.width : (opts.maxWidth != null ? opts.maxWidth : (pageWidth - marginLeft - 50))
      const maxHeight = (opts.height != null) ? opts.height : (opts.maxHeight != null ? opts.maxHeight : (lineHeight * 4))

      const labelText = label ? `${label} ` : ''
      const labelWidth = helvetica.widthOfTextAtSize(labelText, size)
      if (labelText) safeDrawText(page, labelText, { x, y, size }, /*fallbackY*/ pageHeight - 120)

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
        while (helvetica.widthOfTextAtSize(`${last}...`, size) > availWidth && last.length > 0) last = last.slice(0, -1)
        renderedLines[renderedLines.length - 1] = `${last}...`
      }

      const startX = x + labelWidth
      for (let i = 0; i < renderedLines.length; i++) {
        const lineY = ensureValidY(y - i * lineHeight)
        safeDrawText(page, renderedLines[i], { x: startX, y: lineY, size }, /*fallbackY*/ pageHeight - 120)
      }
    }

    const drawFieldOn = (page, fieldKey, label, value, defaultX = marginLeft, defaultY = null, defaultOpts = {}, pageWidth = width, pageHeight = height) => {
      const boxes = pdfData && pdfData.fieldBoxes
      const boxOpts = boxes && (boxes[fieldKey] || boxes[label])
      const merged = Object.assign({}, defaultOpts, boxOpts || {})
      if (merged.x == null) merged.x = defaultX
      if (merged.y == null && defaultY != null) merged.y = defaultY

      const noLabelGlobal = pdfData && pdfData.noLabels
      if (noLabelGlobal) merged.noLabel = true

      // special handling for clientSeries on a page
      if (fieldKey === 'clientSeries' && value) {
        const s = String(value)
        const firstPart = s.slice(0, 2)
        const restPart = s.length > 2 ? s.slice(-6) : ''
        const part1X = Number.isFinite(merged.part1X) ? merged.part1X : merged.x
        let part1Y = Number.isFinite(merged.part1Y) ? merged.part1Y : merged.y
        part1Y = ensureValidY(part1Y)
        const baseForOffset = (Number.isFinite(merged.part1X) ? merged.part1X : merged.x)
        const part2X = Number.isFinite(merged.part2X) ? merged.part2X : (baseForOffset + (Number.isFinite(merged.part2Offset) ? merged.part2Offset : 35))
        let part2Y = Number.isFinite(merged.part2Y) ? merged.part2Y : merged.y
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

      if (boxOpts) return drawWrappedOn(page, label, value, merged, pageWidth, pageHeight)
      const finalY = ensureValidY(Number.isFinite(merged.y) ? merged.y : (pageHeight - 120))
      return safeDrawText(page, label ? `${label} ${value}` : `${value}`, { x: Number.isFinite(merged.x) ? merged.x : marginLeft, y: finalY, size: merged.size || defaultFontSize }, /*fallbackY*/ pageHeight - 120)
    }

    // Like drawFieldAt but for a specific page: keeps same signature but draws on given page.
    const drawFieldAtOn = (page, fieldKey, label, value, defaultX = marginLeft, defaultY = null, defaultOpts = {}, pageWidth = width, pageHeight = height) => {
      return drawFieldOn(page, fieldKey, label, value, defaultX, defaultY, defaultOpts, pageWidth, pageHeight)
    }

    // Use exact coordinates for our own keys (not fillTemplate keys).
    // Defaults can be overridden by entries in pdfData.fieldBoxes using the same keys.
    

    // Client fields (our keys)
    // Order number (can be placed via pdfData.fieldBoxes.orderNumber)
    drawFieldAt('orderNumber', '', normalizeScalar(pdfData.orderNumber ?? pdfData.order_number), width -485, height - 195, { width: 120, height: 18, size: defaultFontSize })
    // Today's date (can be overridden via pdfData.todayDate or positioned via pdfData.fieldBoxes.todayDate)
    const todayDateStrClient = (pdfData && (pdfData.todayDate || pdfData.today_date))
      ? (pdfData.todayDate || pdfData.today_date)
      : (() => {
        const d = new Date()
        const dd = String(d.getDate()).padStart(2, '0')
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const yyyy = d.getFullYear()
        return `${dd}/${mm}/${yyyy}`
      })()
    drawFieldAt('todayDate', '/', normalizeScalar(todayDateStrClient), width - 470  , height - 195, { width: 220, height: 18, size: defaultFontSize })
    // Use single clientName field (no separate first/last)
    drawFieldAt('clientName', '', normalizeScalar(pdfData.clientName ?? pdfData.client_name), 190, height - 390, { width: 300, height: 18, size: defaultFontSize })
    drawFieldAt('clientCNP', '', normalizeScalar(pdfData.clientCNP ?? pdfData.cnp), 320, height - 440, { width: 160, height: 18, size: defaultFontSize })
    drawFieldAt('clientSeries', '', normalizeScalar(pdfData.clientSeries ?? pdfData.serie), 190, height - 440, { width: 100, height: 18, size: defaultFontSize })
    drawFieldAt('clientAddress', '', normalizeScalar(pdfData.clientAddress ?? pdfData.address), 150, height - 415, { width: 300, height: 180, size: defaultFontSize })
   

    // Representative and signatures
    

   

    // Replace any template page-2 text with a blank page, then render a clean summary.
    while (pdfDoc.getPageCount() > 1) pdfDoc.removePage(1)
    const secondPage = pdfDoc.addPage([width, height])
    const { height: h2 } = secondPage.getSize()
    const jobNameText = normalizeScalar(pdfData.jobName ?? pdfData.job_name)
    const totalValueRaw = pdfData.totalValue != null ? pdfData.totalValue : pdfData.total_value
    const totalValueText = totalValueRaw != null && totalValueRaw !== '' && !Number.isNaN(parseFloat(totalValueRaw))
      ? `${parseFloat(totalValueRaw).toFixed(2)} lei`
      : ''

    safeDrawText(secondPage, 'Detalii job', { x: 75, y: h2 - 70, size: defaultFontSize + 1 }, h2 - 70)
    safeDrawText(secondPage, `Job: ${jobNameText}`, { x: 75, y: h2 - 100, size: defaultFontSize }, h2 - 100)
    if (totalValueText) safeDrawText(secondPage, `Valoare job: ${totalValueText}`, { x: 75, y: h2 - 125, size: defaultFontSize }, h2 - 125)

    const uint8Array = await pdfDoc.save()
    const blob = new Blob([uint8Array], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const filenameBase = `${((pdfData.clientName || pdfData.client_name || 'client')).replace(/[^a-z0-9\-_\. ]/gi, '_')}_${(pdfData.jobName || 'job').replace(/[^a-z0-9\-_\. ]/gi, '_')}`
    a.href = url
    a.download = `${filenameBase}_filled.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    return { ok: true }
  } catch (err) {
    console.error('generateAndDownloadPdf error', err)
    return { ok: false, error: err.message || String(err) }
  }
}

export default generateAndDownloadPdf
