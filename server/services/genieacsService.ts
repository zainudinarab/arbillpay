export let genieAcsSettings = {
  url: process.env.GENIEACS_URL || 'http://localhost:7557',
  username: process.env.GENIEACS_USERNAME || '',
  password: process.env.GENIEACS_PASSWORD || '',
  status: 'unknown'
};

export function updateGenieAcsSettings(settings: Partial<{ url: string; username: string; password: string; status: string }>) {
  genieAcsSettings = {
    ...genieAcsSettings,
    ...settings
  };
  return genieAcsSettings;
}
