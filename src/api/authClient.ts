type OperatorRole = 'viewer' | 'operator' | 'admin' | 'auditor' | 'developer';

const DEFAULT_OPERATOR = {
  operatorId: 'porta-console',
  operatorRole: 'viewer' as OperatorRole
};

export const authClient = {
  getOperatorAuth(): { operatorId: string; operatorRole: OperatorRole } {
    return DEFAULT_OPERATOR;
  },

  clearSession(): void {
    localStorage.removeItem('porta.auth.token');
    localStorage.removeItem('porta.auth.session');
    localStorage.removeItem('porta.auth.remembered_user_id');
  }
};
