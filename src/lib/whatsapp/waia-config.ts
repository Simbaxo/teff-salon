type WaiaTemplateType =
  | "BOOKING_CONFIRMATION"
  | "APPOINTMENT_REMINDER"
  | "APPOINTMENT_CANCELLATION";

type WaiaConfig = {
  apiKey: string;
  connectionId: string;
  templates: Record<WaiaTemplateType, string>;
  language: string;
};

export function getWaiaConfig(): WaiaConfig {
  const apiKey = process.env.WAIA_API_KEY;
  const connectionId = process.env.WAIA_CONNECTION_ID;

  if (!apiKey || !apiKey.startsWith("wc_live_")) {
    throw new Error("WAIA_API_KEY_NOT_CONFIGURED");
  }

  if (!connectionId || !connectionId.startsWith("conn_")) {
    throw new Error("WAIA_CONNECTION_NOT_CONFIGURED");
  }

  const templates = {
    BOOKING_CONFIRMATION: process.env.WAIA_TEMPLATE_CONFIRMATION,
    APPOINTMENT_REMINDER: process.env.WAIA_TEMPLATE_REMINDER,
    APPOINTMENT_CANCELLATION: process.env.WAIA_TEMPLATE_CANCELLATION,
  };

  if (
    !templates.BOOKING_CONFIRMATION ||
    !templates.APPOINTMENT_REMINDER ||
    !templates.APPOINTMENT_CANCELLATION
  ) {
    throw new Error("WAIA_TEMPLATES_NOT_CONFIGURED");
  }

  return {
    apiKey,
    connectionId,
    templates: {
      BOOKING_CONFIRMATION: templates.BOOKING_CONFIRMATION,
      APPOINTMENT_REMINDER: templates.APPOINTMENT_REMINDER,
      APPOINTMENT_CANCELLATION: templates.APPOINTMENT_CANCELLATION,
    },
    language: process.env.WAIA_TEMPLATE_LANGUAGE || "es_CO",
  };
}
