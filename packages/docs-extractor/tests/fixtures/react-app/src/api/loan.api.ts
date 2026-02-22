// Simulate axios types for the fixture
declare const axios: {
  create(config: any): {
    post<T>(url: string, data?: any): Promise<{ data: T }>
    get<T>(url: string): Promise<{ data: T }>
    delete(url: string): Promise<void>
  }
}

import type { LoanApplicationDto, LoanResultDto } from "../types/loan.types"

const api = axios.create({ baseURL: "/api" })

export async function applyForLoan(data: LoanApplicationDto): Promise<LoanResultDto> {
  const response = await api.post<LoanResultDto>("/loan/apply", data)
  return response.data
}

export async function getLoanStatus(id: string) {
  const response = await fetch(`/api/loan/status/${id}`)
  return response.json()
}

export async function deleteLoan(id: string) {
  await api.delete("/api/loan")
}
