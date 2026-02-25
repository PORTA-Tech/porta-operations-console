export const authClient = {
  getOperatorAuth(): { operatorId: string; operatorRole: 'viewer' | 'operator' | 'admin' | 'auditor' | 'developer' } {
    const operatorId = localStorage.getItem('porta.operatorId') ?? 'console-operator';
    const operatorRole = (localStorage.getItem('porta.operatorRole') as 'viewer' | 'operator' | 'admin' | 'auditor' | 'developer' | null) ?? 'admin';
    return { operatorId, operatorRole };
  },

  setOperatorAuth(operatorId: string, operatorRole: 'viewer' | 'operator' | 'admin' | 'auditor' | 'developer'): void {
    localStorage.setItem('porta.operatorId', operatorId);
    localStorage.setItem('porta.operatorRole', operatorRole);
  }
};
