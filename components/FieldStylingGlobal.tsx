'use client'

import { useEffect } from 'react'

export function FieldStylingGlobal() {
  useEffect(() => {
    // Create and inject global styles
    const styleId = 'field-styling-global'
    if (document.getElementById(styleId)) return // Already exists
    
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      /* Field styling with global CSS */
      .field-variable-styled {
        display: inline-flex !important;
        align-items: center !important;
        background-color: #f3e5f5 !important;
        border: 2px solid #9c27b0 !important;
        border-radius: 16px !important;
        padding: 4px 10px !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        color: #7c3aed !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
        white-space: nowrap !important;
        position: relative !important;
        cursor: text !important;
        margin: 0 2px !important;
      }

      .field-dynamic-styled {
        display: inline-flex !important;
        align-items: center !important;
        background-color: #e3f2fd !important;
        border: 2px solid #2196f3 !important;
        border-radius: 16px !important;
        padding: 4px 10px !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        color: #1565c0 !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
        white-space: nowrap !important;
        position: relative !important;
        cursor: text !important;
        margin: 0 2px !important;
      }

      /* Icons */
      .field-variable-styled::before {
        content: "🔮";
        font-size: 14px;
        margin-right: 4px;
      }

      .field-type-email::before {
        content: "📧" !important;
      }

      .field-type-date::before {
        content: "📅" !important;
      }

      .field-type-text::before {
        content: "📝" !important;
      }

      .field-type-name::before {
        content: "👤" !important;
      }

      .field-type-phone::before {
        content: "📞" !important;
      }

      .field-type-address::before {
        content: "📍" !important;
      }

      .field-type-number::before {
        content: "🔢" !important;
      }

      /* Required indicator */
      .field-required::after {
        content: "*";
        color: #d32f2f;
        font-weight: bold;
        margin-left: 2px;
      }

      /* Hover effects */
      .field-variable-styled:hover,
      .field-dynamic-styled:hover {
        transform: translateY(-1px) !important;
        box-shadow: 0 4px 8px rgba(0,0,0,0.15) !important;
      }
    `
    
    document.head.appendChild(style)
    
    return () => {
      // Cleanup
      const existingStyle = document.getElementById(styleId)
      if (existingStyle) {
        existingStyle.remove()
      }
    }
  }, [])
  
  return null // This component doesn't render anything
}