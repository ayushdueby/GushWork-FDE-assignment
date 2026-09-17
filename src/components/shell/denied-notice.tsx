export function DeniedNotice({ show }: { show?: string }) {
  if (!show) return null;
  return (
    <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
      That page isn&apos;t available for your role.
    </p>
  );
}
