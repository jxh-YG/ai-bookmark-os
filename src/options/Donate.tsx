import type { Dict } from '../core/i18n';

/** 关于 / 支持页：仅产品说明，无外部作者仓库链接 */
export function DonateTab({ d }: { d: Dict; isZh: boolean }) {
  return (
    <>
      <h2>{d.donateTitle}</h2>
      <p className="desc">{d.donateDesc}</p>

      <div className="card donate-story">
        <h3>{d.donateStoryTitle}</h3>
        {d.donateStory.map((p, i) => (
          <p className="story-p" key={i}>{p}</p>
        ))}
        <p className="story-sign">{d.donateSign}</p>
      </div>

      <div className="card star-card">
        <div className="about-badge" aria-hidden="true">AI</div>
        <p className="star-desc">{d.starTip}</p>
      </div>

      <p className="donate-thanks">{d.donateThanks}</p>
    </>
  );
}
