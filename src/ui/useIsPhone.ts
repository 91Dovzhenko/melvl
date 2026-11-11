import { useEffect, useState } from 'react';

const Q = '(max-width: 767px)';

/** Раскладка iPhone — при ширине окна меньше 768. */
export function useIsPhone() {
  const [phone, setPhone] = useState(() => window.matchMedia(Q).matches);
  useEffect(() => {
    const m = window.matchMedia(Q);
    const on = () => setPhone(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}
