export type UserRole = 'admin' | 'rep';

export type PipelineStage = 'In Underwriting' | 'Offers' | 'Contracts Out' | 'KIF' | 'Funded';

export type OfferStatus = 'open' | 'accepted' | 'declined' | 'expired';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  created_at: string;
}
