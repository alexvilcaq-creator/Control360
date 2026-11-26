import { request } from './client'

function list(resource, query, signal) {
  const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== ''))
  return request(`/${resource}/?${params}`, { signal })
}

export const catalog = {
  list,
  summary: signal => request('/summary/', { signal }),
  save: (resource, id, body) => request(`/${resource}/${id ? `${id}/` : ''}`, {
    method: id ? 'PATCH' : 'POST', body,
  }),
  remove: (resource, id) => request(`/${resource}/${id}/`, { method: 'DELETE' }),
  movements: (id, page, signal) => list(`products/${id}/movements`, { page }, signal),
  adjust: (id, body) => request(`/products/${id}/movements/`, { method: 'POST', body }),
  async options(resource, signal, filters = {}) {
    const results = []
    let page = 1
    let response
    do {
      response = await list(resource, { ...filters, page }, signal)
      results.push(...response.results)
      page += 1
    } while (response.next)
    return results
  },
}
