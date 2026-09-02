export interface Product {
  id: number
  company_id: number
  name: string
  category: string
  quantity: number
  // Decimal fields serialize as JSON strings on the wire (e.g. "19.99") — parse with
  // Number() wherever this needs to be displayed or compared numerically.
  price: string
  created_at: string
  updated_at: string
}

export interface ProductCreateInput {
  name: string
  category: string
  quantity: number
  price: number
}

export interface ProductUpdateInput {
  name?: string
  category?: string
  quantity?: number
  price?: number
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}
