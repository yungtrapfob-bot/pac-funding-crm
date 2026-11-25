export const leadStages = {
  interested: 'Interested',
  application_requested: 'Application requested',
  waiting_application: 'Waiting for application',
  waiting_statements: 'Waiting for statements',
  partial_application: 'Partial application received',
} as const;

export const dealStages: Record<string, string> = {
  missing_documents: 'Missing documents',
  processing: 'Ready for processing',
  submitted: 'Submitted to funders',
  underwriting: 'In underwriting',
  stipulations: 'Awaiting stipulations',
  approved: 'Approved, awaiting pitch',
  pitched: 'Offers out',
  considering: 'Merchant considering',
  contract_requested: 'Contract requested',
  contracts_out: 'Contracts out',
  contracts_signed: 'Contracts signed',
  final_conditions: 'Final funding conditions',
  funded: 'Funded',
  lost: 'Lost',
};

export const lossReasons: Record<string, string> = {
  ghosted: 'Merchant ghosted', incomplete_application: 'Application never completed',
  not_interested: 'Merchant no longer interested', competing_offer: 'Lost to competing offer',
  lender_renewal: 'Existing lender renewed merchant', all_funders_declined: 'Declined by all submitted funders',
  too_expensive: 'Offers too expensive', insufficient_amount: 'Funding amount insufficient',
  unsuitable_payment: 'Payment structure unsuitable', merchant_rejected: 'Merchant rejected offer',
  missing_documents: 'Missing documentation', failed_verification: 'Failed final verification',
  killed_in_final: 'Killed in final', withdrawn: 'Merchant withdrew', ineligible: 'Business no longer eligible',
  duplicate_invalid: 'Duplicate or invalid opportunity', other: 'Other',
};

export const eventLabels: Record<string, string> = {
  ...leadStages, ...dealStages,
  lead_created: 'Interested lead created', converted: 'Converted to deal',
  application_completed: 'Completed application', submitted: 'Submitted to funder',
  approved: 'Approval received', pitched: 'Offer pitched', contracts_out: 'Contract sent',
  contracts_signed: 'Contract signed', lost: 'Marked lost', reopened: 'Reopened',
  call: 'Call logged', text: 'Text logged', email: 'Email logged', note: 'Note added',
  offer_response: 'Funder response recorded', task_completed: 'Follow-up completed', task_scheduled: 'Follow-up scheduled', stage_changed: 'Stage updated',
};

export const leadQueues = {
  active: 'Active', all: 'All leads', converted: 'Converted', lost: 'Lost', archived: 'Archived', review: 'Needs conversion review',
} as const;

export const dealQueueGroups: Record<string, { label: string; stages: string[] }> = {
  processing: { label: 'Processing', stages: ['processing'] },
  underwriting: { label: 'Underwriting', stages: ['submitted', 'underwriting', 'stipulations'] },
  approved: { label: 'Approved', stages: ['approved'] },
  offers: { label: 'Offers out', stages: ['pitched', 'considering'] },
  contracts: { label: 'Contracts out', stages: ['contract_requested', 'contracts_out'] },
  funding: { label: 'Final funding conditions', stages: ['contracts_signed', 'final_conditions'] },
  documents: { label: 'Deals missing documents', stages: ['missing_documents'] },
};
