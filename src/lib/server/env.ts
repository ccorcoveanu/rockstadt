function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export const env = {
  get endpoint() {
    return required("APPWRITE_ENDPOINT");
  },
  get projectId() {
    return required("APPWRITE_PROJECT_ID");
  },
  get databaseId() {
    return required("APPWRITE_DATABASE_ID");
  },
  get bucketId() {
    return required("APPWRITE_BUCKET_ID");
  },
  get apiKey() {
    return required("APPWRITE_API_KEY");
  },
  get appUrl() {
    return required("NEXT_PUBLIC_APP_URL");
  },
};
