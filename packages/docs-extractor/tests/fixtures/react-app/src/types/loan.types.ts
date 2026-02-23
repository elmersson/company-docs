export interface LoanApplicationDto {
  amount: number
  applicantName: string
  email: string
}

export interface LoanResultDto {
  approved: boolean
  loanId: string
  interestRate?: number
}

export interface UpdateLoanDto {
  amount?: number
  term?: number
  purpose?: string
}

export interface LoanDetailDto {
  id: string
  amount: number
  status: "pending" | "active" | "completed" | "rejected"
  createdAt: string
}
