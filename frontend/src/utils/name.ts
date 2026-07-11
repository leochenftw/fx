/**
 * Extract initials or Chinese character from a user's full name.
 * Handles both English/Alphanumeric names (2 letters) and Chinese names intelligently.
 */
export const getInitials = (name: string): string => {
  const cleanName = (name || '').trim();
  if (!cleanName) return 'U';

  const hasChinese = /[\u4e00-\u9fa5]/.test(cleanName);
  if (hasChinese) {
    const withoutSpaces = cleanName.replace(/\s+/g, '');
    return withoutSpaces.slice(-1);
  }

  const clean = cleanName.replace(/[^a-zA-Z0-9 ]/g, '');
  const words = clean.split(' ').filter((w) => w.length > 0);

  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }

  return 'U';
};