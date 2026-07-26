function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get googleMapsServerApiKey(): string {
    return requireEnv("GOOGLE_MAPS_SERVER_API_KEY");
  },
};
