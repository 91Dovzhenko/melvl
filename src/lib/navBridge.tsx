import { useEffect } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';

// Переход по адресу из мест вне текущего экрана (например, после «Отменить», когда экран удалённого проекта уже закрыт).
let navigate: NavigateFunction | null = null;

export function NavBridge() {
  const nav = useNavigate();
  useEffect(() => { navigate = nav; return () => { navigate = null; }; }, [nav]);
  return null;
}

export function goTo(path: string) { navigate?.(path); }
