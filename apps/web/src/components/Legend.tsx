import { t } from '../i18n';
import { STATUS_META, STATUS_ORDER } from '../status';
import { StatusGlyph } from './StatusGlyph';

export function Legend() {
  return (
    <>
      <div className='card__head'>
        <div>
          <h2 id='legend-title' className='card__title'>
            {t("Легенда")}</h2>
          <p className='card__sub'>{t("Как читать схему и график")}</p>
        </div>
      </div>

      <div className='legend'>
        <h3 className='legend__title'>{t("Статусы станций")}</h3>
        <ul className='legend__list'>
          {STATUS_ORDER.map((status) => (
            <li key={status} className={`st--${status}`}>
              <span className='legend__glyph'>
                <StatusGlyph status={status} size={16} />
              </span>
              <span>
                <strong>{t(STATUS_META[status].label)}</strong>
                <span className='muted'> — {t(STATUS_META[status].hint)}</span>
              </span>
            </li>
          ))}
        </ul>

        <h3 className='legend__title'>{t("Элементы схемы")}</h3>
        <ul className='legend__list'>
          <li>
            <span className='legend__glyph'>
              <svg width='34' height='16' viewBox='0 0 34 16' aria-hidden='true' focusable='false'>
                <rect x='1' y='1' width='13' height='13' rx='3' className='slot slot--filled' />
                <rect x='19' y='1' width='13' height='13' rx='3' className='slot' />
              </svg>
            </span>
            <span>
              <strong>{t("Очередь")}</strong>
              <span className='muted'> {t(" — занятые и свободные места буфера перед станцией; янтарный цвет — буфер почти полон.")}</span>
            </span>
          </li>
          <li>
            <span className='legend__glyph'>
              <svg width='34' height='16' viewBox='0 0 34 16' aria-hidden='true' focusable='false'>
                <line x1='1' y1='8' x2='33' y2='8' className='legend__flow' />
              </svg>
            </span>
            <span>
              <strong>{t("Бегущий пунктир")}</strong>
              <span className='muted'> {t(" — поток изделий; анимация идёт только при запущенной симуляции и живой связи.")}</span>
            </span>
          </li>
          <li>
            <span className='legend__glyph'>
              <svg width='22' height='22' viewBox='-11 -11 22 22' aria-hidden='true' focusable='false'>
                <circle r='10' className='legend__alert' />
                <text y='4' textAnchor='middle' className='legend__alert-text'>
                  !
                </text>
              </svg>
            </span>
            <span>
              <strong>{t("Значок «!»")}</strong>
              <span className='muted'> {t(" — у станции есть активный инцидент.")}</span>
            </span>
          </li>
        </ul>

        <h3 className='legend__title'>{t("О данных")}</h3>
        <p className='muted legend__about'>
          {t("Склад снабжения показывает число поданных на линию изделий. При занятом входе очередная подача пропускается. НЗП включает автомобили между контролем качества и выходом; выпуск учитывается на выходе с линии. Показатели рассчитаны моделью, схема иллюстративная.")}</p>
      </div>
    </>
  );
}
