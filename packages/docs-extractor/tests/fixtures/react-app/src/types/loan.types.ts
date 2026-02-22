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
