/**
 * Guest-supplied strings end up inside owner and guest emails. Escaping them is
 * what stops a guest called `<script>` — or one who types a special request full
 * of angle brackets — from rewriting the email around it.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
