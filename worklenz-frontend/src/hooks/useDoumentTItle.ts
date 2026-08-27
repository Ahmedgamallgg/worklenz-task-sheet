import { useEffect } from 'react';

export const useDocumentTitle = (title: string) => {
  return useEffect(() => {
    document.title = `Seven C's Creative Hub | ${title}`;
  }, [title]);
};
