/**
 * Minimal allow-list sanitizer for contract HTML shown in the review screen (client only, DOMParser).
 * Unknown elements are unwrapped (children kept); scripts/styles/embeds are dropped with their content.
 */
const ALLOWED = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup', 'mark', 'span', 'div', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'colgroup', 'col', 'a', 'img',
])
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'form', 'input', 'button', 'textarea', 'select', 'svg', 'math', 'noscript', 'template', 'base'])

const SAFE_URL = /^(https?:|mailto:|tel:|#|\/(?!\/))/i
const SAFE_IMG = /^(https?:|data:image\/(png|jpe?g|gif|webp);base64,|\/(?!\/))/i

function cleanAttrs(el: Element) {
  const tag = el.tagName.toLowerCase()
  Array.from(el.attributes).forEach((a) => {
    const name = a.name.toLowerCase()
    const val = a.value.trim()
    const keep =
      (name === 'href' && tag === 'a' && SAFE_URL.test(val)) ||
      (name === 'src' && tag === 'img' && SAFE_IMG.test(val)) ||
      (name === 'alt' && tag === 'img') ||
      (name === 'colspan' || name === 'rowspan') ||
      (name === 'class' && !/[^\w\s-]/.test(val)) ||
      (name === 'style' && /^text-align:\s*(left|right|center|justify);?$/i.test(val))
    if (!keep) el.removeAttribute(a.name)
  })
  if (tag === 'a') {
    el.setAttribute('rel', 'noopener noreferrer')
    el.setAttribute('target', '_blank')
  }
}

function walk(node: Node) {
  Array.from(node.childNodes).forEach((child) => {
    if (child.nodeType === 8) return void node.removeChild(child) // comment
    if (child.nodeType !== 1) return
    const el = child as Element
    const tag = el.tagName.toLowerCase()
    if (DROP.has(tag)) return void node.removeChild(el)
    walk(el)
    if (!ALLOWED.has(tag)) {
      while (el.firstChild) node.insertBefore(el.firstChild, el)
      node.removeChild(el)
      return
    }
    cleanAttrs(el)
  })
}

export function sanitizeContractHtml(html: string | undefined | null): string {
  if (!html) return ''
  if (typeof DOMParser === 'undefined') return ''
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  walk(doc.body)
  return doc.body.innerHTML
}
