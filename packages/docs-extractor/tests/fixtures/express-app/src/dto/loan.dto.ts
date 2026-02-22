export enum EmploymentStatus {
  EMPLOYED = "EMPLOYED",
  SELF_EMPLOYED = "SELF_EMPLOYED",
  UNEMPLOYED = "UNEMPLOYED",
}

export interface LoanApplicationDto {
  amount: number
  employmentStatus: EmploymentStatus
  applicantName: string
  email: string
  monthlyIncome?: number
}

export interface LoanResultDto {
  approved: boolean
  loanId: string
  interestRate?: number
  rejectionReason?: string
}

export type LoanStatusDto = {
  id: string
  status: "pending" | "approved" | "rejected"
  updatedAt: string
}
