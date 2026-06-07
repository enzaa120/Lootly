import { useState, useEffect } from 'react';
import { quotes } from '../data/quotes';

export function useRandomQuote() {
  const [quote, setQuote] = useState<string>('');

  useEffect(() => {
    // Generate random quote every time component mounts
    const newIdx = Math.floor(Math.random() * quotes.length);
    setQuote(quotes[newIdx]);
  }, []);

  return quote;
}
