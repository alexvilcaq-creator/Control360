import { Package } from 'lucide-react'

const photographedSkus = new Set([
  'BEB-001', 'BEB-002', 'BEB-003', 'ABA-001', 'ABA-002', 'ABA-003',
  'LIM-001', 'LIM-002', 'LIM-003', 'HOG-001', 'HOG-002', 'HOG-003',
])

export default function ProductPhoto({ product }) {
  if (!photographedSkus.has(product.sku)) {
    return <span className="product-tile product-photo product-icon" aria-hidden="true"><Package size={19}/></span>
  }
  return <img className="product-tile product-photo" src={`/images/${product.sku.toLowerCase()}.webp`}
    alt="" width="40" height="40" loading="lazy" decoding="async"/>
}
