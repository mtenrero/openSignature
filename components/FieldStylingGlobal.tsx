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
        cursor: pointer !important;
        margin: 2px !important;
        min-height: 32px !important;
        box-sizing: border-box !important;
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
        cursor: pointer !important;
        margin: 2px !important;
        min-height: 32px !important;
        box-sizing: border-box !important;
      }

      /* Dark mode: keep the badges readable on the dark surface */
      [data-mantine-color-scheme='dark'] .field-variable-styled {
        background-color: rgba(156, 39, 176, 0.25) !important;
        border-color: #ce93d8 !important;
        color: #e1bee7 !important;
      }
      [data-mantine-color-scheme='dark'] .field-dynamic-styled {
        background-color: rgba(33, 150, 243, 0.22) !important;
        border-color: #64b5f6 !important;
        color: #bbdefb !important;
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

      /* Hover effects only where hover exists (never the only affordance: badges open a sheet on tap) */
      @media (hover: hover) {
        .field-variable-styled:hover,
        .field-dynamic-styled:hover {
          transform: translateY(-1px) !important;
          box-shadow: 0 4px 8px rgba(0,0,0,0.15) !important;
        }
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