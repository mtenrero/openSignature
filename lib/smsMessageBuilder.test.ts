import { buildSignatureSMS, calculateSMSSegments } from './smsMessageBuilder'

describe('buildSignatureSMS', () => {
  const shortUrl = 'https://osign.eu/s/abc123'
  const longUrl = 'https://opensignature.com/sign-request/very-long-identifier-here-123456789'

  describe('Standard use cases', () => {
    it('should build basic SMS without contract name', () => {
      const message = buildSignatureSMS(shortUrl)
      expect(message).toBe(`Se solicita su firma en: ${shortUrl}`)
      expect(message.length).toBeLessThanOrEqual(160)
    })

    it('should include contract name when it fits', () => {
      const contractName = 'Contrato de servicios'
      const message = buildSignatureSMS(shortUrl, contractName)
      expect(message).toBe(`Se solicita su firma en el contrato "${contractName}": ${shortUrl}`)
      expect(message.length).toBeLessThanOrEqual(160)
    })

    it('should handle short contract names', () => {
      const contractName = 'NDA'
      const message = buildSignatureSMS(shortUrl, contractName)
      expect(message).toBe(`Se solicita su firma en el contrato "${contractName}": ${shortUrl}`)
      expect(message.length).toBeLessThanOrEqual(160)
    })

    it('should handle medium contract names', () => {
      const contractName = 'Contrato de arrendamiento de vivienda'
      const message = buildSignatureSMS(shortUrl, contractName)
      expect(message).toContain(contractName)
      expect(message.length).toBeLessThanOrEqual(160)
    })
  })

  describe('Truncation cases', () => {
    it('should truncate very long contract names to fit in 160 chars (1 SMS)', () => {
      // Use accented characters to verify they get normalized
      const contractName = 'Contrato de prestación de servicios profesionales de consultoría tecnológica y desarrollo de software'
      const message = buildSignatureSMS(shortUrl, contractName)

      // Verify message structure (ASCII ellipsis ...)
      expect(message).toMatch(/^Se solicita su firma en el contrato ".*\.\.\.": https:\/\//)
      expect(message).toContain(shortUrl)
      expect(message).toContain('...') // ASCII ellipsis

      // Critical: must be exactly 160 chars or less
      expect(message.length).toBeLessThanOrEqual(160)

      // Should be 1 SMS segment (accents normalized to ASCII, ellipsis is ASCII)
      expect(calculateSMSSegments(message)).toBe(1)

      // Verify accents were removed (prestación → prestacion)
      expect(message).toContain('prestacion')
      expect(message).toContain('consultoria')
      expect(message).not.toContain('ó') // No accents
      expect(message).not.toContain('í')

      // Expected format example:
      // "Se solicita su firma en el contrato "Contrato de prestacion de servicios profesionales de consultoria tecnologica y desarrollo de...": https://osign.eu/s/abc123"
    })

    it('should handle extremely long URLs by using base template', () => {
      const veryLongUrl = 'https://opensignature.com/sign/' + 'x'.repeat(200)
      const message = buildSignatureSMS(veryLongUrl)

      expect(message).toBe(`Se solicita su firma en: ${veryLongUrl}`.substring(0, 160))
      expect(message.length).toBe(160)
    })

    it('should prioritize URL over contract name when space is limited', () => {
      const contractName = 'Contrato importante'
      const message = buildSignatureSMS(longUrl, contractName)

      expect(message).toContain(longUrl)
      expect(message.length).toBeLessThanOrEqual(160)
    })

    it('should truncate contract name to fit with long URL', () => {
      const contractName = 'Contrato de arrendamiento con opcion a compra'
      const message = buildSignatureSMS(longUrl, contractName)

      expect(message).toContain(longUrl)
      expect(message.length).toBeLessThanOrEqual(160)

      // ASCII-only should be 1 segment
      expect(calculateSMSSegments(message)).toBe(1)

      if (message.includes('...')) {
        // When truncated, should use all 160 chars
        expect(message.length).toBe(160)
      }
    })
  })

  describe('Edge cases', () => {
    it('should handle empty contract name', () => {
      const message = buildSignatureSMS(shortUrl, '')
      expect(message).toBe(`Se solicita su firma en: ${shortUrl}`)
    })

    it('should handle whitespace-only contract name', () => {
      const message = buildSignatureSMS(shortUrl, '   ')
      expect(message).toBe(`Se solicita su firma en: ${shortUrl}`)
    })

    it('should handle undefined contract name', () => {
      const message = buildSignatureSMS(shortUrl, undefined)
      expect(message).toBe(`Se solicita su firma en: ${shortUrl}`)
    })

    it('should handle null contract name', () => {
      const message = buildSignatureSMS(shortUrl, null as any)
      expect(message).toBe(`Se solicita su firma en: ${shortUrl}`)
    })

    it('should handle exactly 160 characters without contract name', () => {
      const exactUrl = 'https://osign.eu/s/' + 'x'.repeat(128) // Total = 160
      const message = buildSignatureSMS(exactUrl)
      expect(message.length).toBe(160)
    })

    it('should remove accents from contract names with special characters', () => {
      const contractName = 'Contrato "especial" & único'
      const message = buildSignatureSMS(shortUrl, contractName)
      expect(message.length).toBeLessThanOrEqual(160)
      expect(message).toContain('unico') // único → unico
      expect(message).not.toContain('ú')
      expect(calculateSMSSegments(message)).toBe(1) // ASCII-only = 1 SMS
    })

    it('should handle contract name with quotes', () => {
      const contractName = 'Mi "Contrato"'
      const message = buildSignatureSMS(shortUrl, contractName)
      expect(message).toContain('Mi "Contrato"')
    })

    it('should handle URL at exactly 160 char limit with base template', () => {
      const urlLength = 160 - 'Se solicita su firma en: '.length
      const exactUrl = 'https://osign.eu/' + 'x'.repeat(urlLength - 18)
      const message = buildSignatureSMS(exactUrl, 'Any Name')
      expect(message.length).toBeLessThanOrEqual(160)
    })
  })

  describe('Message format validation', () => {
    it('should always start with "Se solicita su firma"', () => {
      const message1 = buildSignatureSMS(shortUrl)
      const message2 = buildSignatureSMS(shortUrl, 'Contract')

      expect(message1).toMatch(/^Se solicita su firma/)
      expect(message2).toMatch(/^Se solicita su firma/)
    })

    it('should always include the URL', () => {
      const message1 = buildSignatureSMS(shortUrl)
      const message2 = buildSignatureSMS(shortUrl, 'Very long contract name that needs truncation')

      expect(message1).toContain(shortUrl)
      expect(message2).toContain(shortUrl)
    })

    it('should use correct format with contract name', () => {
      const contractName = 'Test Contract'
      const message = buildSignatureSMS(shortUrl, contractName)
      expect(message).toMatch(/Se solicita su firma en el contrato ".*":/)
    })

    it('should use ASCII ellipsis (...) not unicode (…)', () => {
      const longName = 'A'.repeat(100)
      const message = buildSignatureSMS(shortUrl, longName)

      if (message.includes('...')) {
        expect(message).not.toContain('…') // No unicode ellipsis
        expect(message.split('...').length - 1).toBe(1) // Only one ellipsis
        expect(calculateSMSSegments(message)).toBe(1) // ASCII-only = 1 SMS
      }
    })
  })

  describe('Real-world scenarios', () => {
    it('should handle typical Spanish contract names', () => {
      const names = [
        'Contrato de trabajo',
        'NDA - Acuerdo de confidencialidad',
        'LOPD',
        'Contrato de arrendamiento',
        'Presupuesto',
      ]

      names.forEach(name => {
        const message = buildSignatureSMS(shortUrl, name)
        expect(message.length).toBeLessThanOrEqual(160)
        expect(message).toContain(shortUrl)
      })
    })

    it('should handle production-like URLs', () => {
      const urls = [
        'https://osign.eu/s/HAbQWpv36U',
        'https://opensignature.com/sign/abc123def456',
        'https://app.osign.eu/firma/x1y2z3',
      ]

      urls.forEach(url => {
        const message = buildSignatureSMS(url, 'Contrato')
        expect(message.length).toBeLessThanOrEqual(160)
        expect(message).toContain(url)
      })
    })
  })
})

describe('calculateSMSSegments', () => {
  describe('Standard ASCII messages', () => {
    it('should return 1 segment for empty string', () => {
      expect(calculateSMSSegments('')).toBe(0)
    })

    it('should return 1 segment for message under 160 chars', () => {
      expect(calculateSMSSegments('Hello world')).toBe(1)
      expect(calculateSMSSegments('x'.repeat(160))).toBe(1)
    })

    it('should return 2 segments for message over 160 chars', () => {
      expect(calculateSMSSegments('x'.repeat(161))).toBe(2)
      expect(calculateSMSSegments('x'.repeat(200))).toBe(2)
    })

    it('should return 2 segments for exactly 320 chars', () => {
      expect(calculateSMSSegments('x'.repeat(320))).toBe(2)
    })

    it('should return 3 segments for 321 chars', () => {
      expect(calculateSMSSegments('x'.repeat(321))).toBe(3)
    })
  })

  describe('Unicode messages', () => {
    it('should return 1 segment for unicode under 70 chars', () => {
      expect(calculateSMSSegments('Hola señor')).toBe(1)
      expect(calculateSMSSegments('ñ'.repeat(70))).toBe(1)
    })

    it('should return 2 segments for unicode over 70 chars', () => {
      expect(calculateSMSSegments('ñ'.repeat(71))).toBe(2)
      expect(calculateSMSSegments('ñ'.repeat(100))).toBe(2)
    })

    it('should detect emojis as unicode', () => {
      expect(calculateSMSSegments('Hello 😀')).toBe(1)
      expect(calculateSMSSegments('😀'.repeat(71))).toBeGreaterThan(1)
    })

    it('should detect accented characters as unicode', () => {
      expect(calculateSMSSegments('café')).toBe(1)
      expect(calculateSMSSegments('á'.repeat(71))).toBe(2)
    })

    it('should detect special Spanish characters', () => {
      expect(calculateSMSSegments('ñáéíóúü')).toBe(1)
    })
  })

  describe('Edge cases', () => {
    it('should handle exactly 70 unicode chars', () => {
      expect(calculateSMSSegments('ñ'.repeat(70))).toBe(1)
    })

    it('should handle exactly 160 ASCII chars', () => {
      expect(calculateSMSSegments('a'.repeat(160))).toBe(1)
    })

    it('should handle mixed ASCII and unicode', () => {
      const message = 'Hello señor ' + 'x'.repeat(60)
      const segments = calculateSMSSegments(message)
      expect(segments).toBeGreaterThanOrEqual(1)
    })

    it('should handle newlines and special chars', () => {
      const message = 'Line 1\nLine 2\tTab'
      expect(calculateSMSSegments(message)).toBe(1)
    })
  })

  describe('Real-world scenarios', () => {
    it('should calculate segments for typical signature request', () => {
      const message = buildSignatureSMS('https://osign.eu/s/abc123', 'Contrato')
      const segments = calculateSMSSegments(message)
      expect(segments).toBe(1) // Should fit in 1 SMS
    })

    it('should calculate segments for Spanish message', () => {
      const message = 'Se solicita su firma en el contrato "LOPD": https://osign.eu/s/xyz'
      const segments = calculateSMSSegments(message)
      expect(segments).toBe(1)
    })

    it('should normalize accents in long contract names (always 1 SMS)', () => {
      const shortUrl = 'https://osign.eu/s/abc123'
      const contractName = 'Contrato de prestación de servicios profesionales' // with accents
      const message = buildSignatureSMS(shortUrl, contractName)
      const segments = calculateSMSSegments(message)

      expect(message).toContain('prestacion') // normalized
      expect(message.length).toBeLessThanOrEqual(160)
      expect(segments).toBe(1) // Should always be 1 SMS (ASCII-only)
    })

    it('should ensure all messages use exactly 1 SMS segment (ASCII-only)', () => {
      const shortUrl = 'https://osign.eu/s/abc123'
      const longNames = [
        'Contrato de prestación de servicios profesionales de consultoría tecnológica', // with accents
        'Acuerdo marco de colaboración empresarial y desarrollo de proyectos conjuntos',
        'Contrato de arrendamiento de local comercial con opción de compra a largo plazo'
      ]

      longNames.forEach(name => {
        const message = buildSignatureSMS(shortUrl, name)
        expect(message.length).toBeLessThanOrEqual(160)
        expect(calculateSMSSegments(message)).toBe(1) // Always 1 SMS (accents removed)

        // Verify no accents in output
        expect(message).not.toContain('ó')
        expect(message).not.toContain('í')
        expect(message).not.toContain('á')
      })
    })
  })
})
