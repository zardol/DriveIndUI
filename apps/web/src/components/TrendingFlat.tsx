/** Небольшая SVG-пиктограмма тренда для карточки оценки. */
export function TrendingFlat() {
  return (
    <span className='forecast__icon' aria-hidden='true'>
      <svg width='18' height='18' viewBox='0 0 18 18' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round'>
        <path d='M2 13 7 8l3 3 6-6' />
        <path d='M12 5h4v4' />
      </svg>
    </span>
  );
}
