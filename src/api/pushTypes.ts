export type PushAlertPreferences = {
  clockIn: boolean;
  clockOut: boolean;
};

export type PushSubscriptionKeys = {
  auth: string;
  p256dh: string;
};

export type PushSubscriptionInput = {
  deviceLabel: string;
  endpoint: string;
  expirationTime?: number | null;
  keys: PushSubscriptionKeys;
  preferences: PushAlertPreferences;
};

export type PushDevice = {
  createdAt: string;
  deviceLabel: string;
  enabled: boolean;
  id: string;
  lastSuccessAt?: string;
  preferences: PushAlertPreferences;
};

export type PushConfiguration = {
  configured: boolean;
  currentDeviceId?: string;
  devices: PushDevice[];
  publicKey?: string;
};

export type PushNotificationPayload = {
  body: string;
  icon?: string;
  tag: string;
  title: string;
  url: string;
};
