export async function persistReplacement<T>(input: {
  uploadNew: () => Promise<T>;
  persistNew: (uploaded: T) => Promise<void>;
  removeNew: (uploaded: T) => Promise<void>;
  previousPaths?: readonly string[];
  removePrevious?: (path: string) => Promise<void>;
}) {
  const uploaded = await input.uploadNew();
  try {
    await input.persistNew(uploaded);
  } catch (error) {
    await input.removeNew(uploaded).catch(() => undefined);
    throw error;
  }

  if (input.removePrevious) {
    await Promise.allSettled(
      Array.from(new Set(input.previousPaths || [])).filter(Boolean).map((path) => input.removePrevious!(path))
    );
  }
  return uploaded;
}
