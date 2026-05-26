export type CreateUserFormState = {
  status: 'idle' | 'success' | 'error';
  message: string;
};

export const initialCreateUserFormState: CreateUserFormState = {
  status: 'idle',
  message: ''
};
