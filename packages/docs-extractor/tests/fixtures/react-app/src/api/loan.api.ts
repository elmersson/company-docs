// Simulate axios types for the fixture
declare const axios: {
  create(config: any): {
    post<T>(url: string, data?: any): Promise<{ data: T }>
    get<T>(url: string): Promise<{ data: T }>
    delete(url: string): Promise<void>
    put<T>(url: string, data?: any): Promise<{ data: T }>
  }
}

import type { LoanApplicationDto, LoanResultDto, UpdateLoanDto, LoanDetailDto } from "../types/loan.types"

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

export async function updateLoan(id: string, data: UpdateLoanDto): Promise<LoanDetailDto> {
  try {
    const response = await api.put<LoanDetailDto>("/loan/update", data)
    return response.data
  } catch (error) {
    throw error
  }
}

export const fetchLoanList = async (): Promise<LoanDetailDto[]> => {
  const response = await api.get<LoanDetailDto[]>("/loan/list")
  return response.data
}
