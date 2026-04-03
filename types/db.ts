export type UserRole = 'admin' | 'rep';

export type PipelineStage =
  | 'Application Submitted'
  | 'Application Processed'
  | 'Offers / Declines Received'
  | 'Deal Pitched'
  | 'Contracts Requested'
  | 'Contracts Signed'
  | 'Funded'
  | 'Killed';

export type OfferStatus = 'open' | 'accepted' | 'declined' | 'expired';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  created_at: string;
}
