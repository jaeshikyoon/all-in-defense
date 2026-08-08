import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
} from "react";
import { GameEngine, type Snapshot } from "./game/Engine";
import { mountBoard } from "./game/PixiBoard";
import { gameAudio } from "./game/AudioManager";
import { circularIndex, sortBattlefieldsByName } from "./game/ui";
import { publicAssetUrl } from "./game/assets";
import {
  BUILDINGS,
  ENEMIES,
  ENEMY_ASSET_FILES,
  ENEMY_PHASE_INFO,
  getMapAssetFootprint,
  getUnitDamage,
  PAYOUT,
  STRONG_DAMAGE_MULTIPLIERS,
  UNIT_ASSET_FILES,
  UNITS,
  type FloorKind,
  type EnemyKind,
  type MapAssetKind,
  type UnitKind,
} from "./game/data";
import {
  HAND_NAMES,
  HAND_PROBABILITY,
  HAND_REWARD_COUNT,
  HAND_UNITS,
  RANK_LABEL,
  SUIT_SYMBOL,
  type HandRank,
} from "./game/poker";
import {
  addScore,
  createStoredMap,
  deleteStoredMap,
  exportMapJson,
  getMapScores,
  importMapJson,
  initializeMaps,
  listMaps,
  saveStoredMap,
  setCurrentMapId,
  type ScoreRecord,
  type StoredMap,
} from "./game/storage";

const engine = new GameEngine();
const handOrder: HandRank[] = [
  "high_card",
  "one_pair",
  "two_pair",
  "three_kind",
  "straight",
  "flush",
  "full_house",
  "four_kind",
  "straight_flush",
  "royal_flush",
];
const enemyOrder: EnemyKind[] = [
  "grunt",
  "runner",
  "drone",
  "sapper",
  "phantom",
  "armored",
  "brute",
  "phase_tracker",
  "elite",
  "juggernaut",
  "warden",
  "boss",
];

type GameButtonVariant = "primary" | "secondary" | "danger" | "icon" | "option";

function GameButton({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: GameButtonVariant;
}) {
  return (
    <button
      {...props}
      className={`game-button game-button-${variant} ${className}`.trim()}
    />
  );
}

function SoundControl({
  enabled,
  volume,
  open,
  onToggle,
}: {
  enabled: boolean;
  volume: number;
  open: boolean;
  onToggle: () => void;
}) {
  const audible = enabled && volume > 0;
  return (
    <div className={`sound-control ${open ? "open" : ""}`}>
      <button
        className={audible ? "sound" : "sound muted"}
        title="볼륨 조절"
        aria-label="볼륨 조절"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span aria-hidden="true">{audible ? (volume < 0.45 ? "🔉" : "🔊") : "🔇"}</span>
        <b></b>
      </button>
      {open && (
        <div className="volume-popover panel" role="dialog" aria-label="볼륨 조절">
          <header>
            <b>전체 볼륨</b>
            <strong>{Math.round(volume * 100)}%</strong>
          </header>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round(volume * 100)}
            aria-label="전체 볼륨"
            style={{ "--volume": `${volume * 100}%` } as CSSProperties}
            onChange={(event) => gameAudio.setVolume(Number(event.target.value) / 100)}
          />
          <button
            className="volume-mute"
            aria-pressed={!audible}
            onClick={() =>
              audible
                ? gameAudio.toggle()
                : gameAudio.setVolume(volume > 0 ? volume : 0.5)
            }
          >
            {audible ? "음소거" : "소리 켜기"}
          </button>
        </div>
      )}
    </div>
  );
}
const icons: Record<UnitKind, string> = {
  militia: "•",
  rifle: "◆",
  gunner: "▰",
  cryo: "✦",
  bomber: "●",
  sniper: "⌁",
  tesla: "ϟ",
  mortar: "♣",
  railgun: "♠",
  cataclysm: "♣",
};
const choices = ["1", "2", "5", "10", "20", "Joker", "Crest"];
const odds: Record<string, string> = {
  "1": "42.6%",
  "2": "27.8%",
  "5": "14.8%",
  "10": "7.4%",
  "20": "3.7%",
  Joker: "1.9%",
  Crest: "1.9%",
};
const visibleBattlePhase = (snap: Snapshot) =>
  snap.state === "poker" || snap.state === "deploy" || snap.state === "ready"
    ? Math.max(1, snap.phase + 1)
    : Math.max(1, snap.phase);
const formatPlayTime = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds)),
    hours = Math.floor(total / 3600),
    minutes = Math.floor((total % 3600) / 60),
    remainingSeconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

async function enterMobileLandscape(root: HTMLElement | null) {
  const isTouchDevice = navigator.maxTouchPoints > 0 ||
    window.matchMedia("(pointer: coarse)").matches;
  if (!isTouchDevice) return true;

  try {
    if (!document.fullscreenElement && root?.requestFullscreen) {
      await root.requestFullscreen({ navigationUI: "hide" });
    }
  } catch {
    // iOS and embedded browsers may reject fullscreen. Orientation lock can
    // still work for an installed PWA, so continue with the lock attempt.
  }

  try {
    await screen.orientation?.lock?.("landscape");
  } catch {
    // An ordinary browser tab is allowed to reject orientation locking.
    // The portrait fallback remains visible in that case.
  }

  return window.matchMedia("(orientation: landscape)").matches;
}

function Minimap({ snap }: { snap: Snapshot }) {
  const battlePhase = visibleBattlePhase(snap),
    openCount = snap.routeStartPhases.filter(
      (startPhase) => startPhase <= battlePhase,
    ).length;
  return (
    <div className="minimap">
      <svg viewBox={`0 0 ${snap.mapWidth * 2} ${snap.mapHeight * 1.25}`}>
        {snap.routes.map((route, index) => {
          const pts = route.map((p) => `${p[0] * 2},${p[1] * 1.25}`).join(" "),
            start = route[0],
            end = route.at(-1),
            open = (snap.routeStartPhases[index] ?? 1) <= battlePhase;
          return (
            <g key={index} opacity={open ? 1 : 0.34}>
              <polyline
                points={pts}
                fill="none"
                stroke="#4b3940"
                strokeWidth="5"
                strokeLinejoin="round"
              />
              <polyline
                points={pts}
                fill="none"
                stroke={open ? (index % 2 ? "#72d8ef" : "#e5b270") : "#71808a"}
                strokeWidth="1"
                strokeDasharray={open ? undefined : "3 2"}
              />
              {start && (
                <circle
                  cx={start[0] * 2}
                  cy={start[1] * 1.25}
                  r="2.3"
                  fill={open ? "#57e8c2" : "#f2b75d"}
                />
              )}
              {index === 0 && end && (
                <circle
                  cx={end[0] * 2}
                  cy={end[1] * 1.25}
                  r="2.5"
                  fill="#ff4567"
                />
              )}
            </g>
          );
        })}
      </svg>
      <span>
        전장 지도 · 입구 {openCount}/{snap.routes.length} 개방
      </span>
    </div>
  );
}

function EntranceSchedule({ snap }: { snap: Snapshot }) {
  const battlePhase = visibleBattlePhase(snap),
    running = snap.state === "running",
    nextPhase = snap.routeStartPhases
      .filter((phase) => phase > battlePhase)
      .sort((a, b) => a - b)[0],
    openingNow = snap.routeStartPhases.filter(
      (phase) => phase === battlePhase,
    ).length;
  return (
    <div className="entrance-schedule panel">
      <header>
        <span>입구 개방 현황</span>
        <b>PHASE {battlePhase}</b>
      </header>
      <small>
        {!running && openingNow
          ? `다음 전투에 ${openingNow}개 입구 사용`
          : nextPhase
            ? `다음 개방: PHASE ${nextPhase}`
            : "모든 입구 개방 완료"}
      </small>
      <div>
        {snap.routes.map((_, index) => {
          const startPhase = snap.routeStartPhases[index] ?? 1,
            active = startPhase <= snap.phase,
            open = startPhase <= battlePhase,
            phasesRemaining = Math.max(1, startPhase - snap.phase);
          return (
            <div className={open ? "open" : "locked"} key={index}>
              <i />
              <b>{active ? "개방됨" : "대기 중"}</b>
              <span>
                {active
                  ? running
                    ? "활성"
                    : "사용 중"
                  : `${phasesRemaining} PHASE 후`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EnemyGuide({ onClose, snap }: { onClose: () => void; snap: Snapshot }) {
  const phase = visibleBattlePhase(snap);
  return (
    <div className="modal-back enemy-guide-back">
      <section className="enemy-guide panel" role="dialog" aria-modal="true">
        <header>
          <div>
            <h2>적 도감</h2>
            <small>PHASE {phase} 기준</small>
          </div>
          <GameButton variant="icon" onClick={onClose} aria-label="닫기">×</GameButton>
        </header>
        <div className="enemy-guide-grid">
          {enemyOrder.map((kind) => {
            const enemy = ENEMIES[kind],
              phaseInfo = ENEMY_PHASE_INFO[kind],
              currentHp = engine.getEnemyMaxHp(kind, phase),
              unlocked = phase >= phaseInfo.firstPhase;
            return (
              <article key={kind} className={unlocked ? "" : "locked-enemy"}>
                <img
                  src={publicAssetUrl(`assets/units/${ENEMY_ASSET_FILES[kind]}.png`)}
                  alt={enemy.name}
                  draggable={false}
                />
                <div>
                  <b>{enemy.name}</b>
                  <em>{phaseInfo.role}</em>
                  <span>
                    <i>HP</i> {enemy.hp.toLocaleString()}
                  </span>
                  <span>
                    <i>이동속도</i> ×{enemy.speed.toFixed(2)}
                  </span>
                  <span className="enemy-phase-tag">
                    <i>등장</i> PHASE {phaseInfo.firstPhase}
                    {phaseInfo.cycle ? ` · ${phaseInfo.cycle} PHASE 주기` : "부터"}
                  </span>
                  <span className="enemy-current-hp">
                    {unlocked ? (
                      <>
                        <i>현재 P{phase}</i> HP {currentHp.toLocaleString()}
                      </>
                    ) : (
                      <>
                        <i>등장 전</i> P{phaseInfo.firstPhase} 기본 HP{" "}
                        {enemy.hp.toLocaleString()}
                      </>
                    )}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function PokerModal({ snap, onExit }: { snap: Snapshot; onExit: () => void }) {
  const result = snap.pokerResult,
    [showRewards, setShowRewards] = useState(false);
  return (
    <div className="modal-back poker-back">
      <section className="poker-modal panel">
        {!showRewards && (
          <GameButton
            variant="icon"
            className="poker-home"
            onClick={onExit}
            title="기록을 저장하고 홈으로"
            aria-label="기록을 저장하고 홈으로"
          >
            ⌂
          </GameButton>
        )}
        <p className="eyebrow">PHASE {snap.phase + 1}</p>
        <h2>포커 드로우</h2>
        <div className="poker-hand">
          {snap.hand.map((card, index) => (
            <button
              key={card.id}
              className={`${card.suit === "hearts" || card.suit === "diamonds" ? "red" : ""} ${snap.discarded.includes(index) ? "discard" : ""}`}
              style={{ animationDelay: `${index * 85}ms` }}
              disabled={!!result}
              onClick={() => engine.toggleDiscard(index)}
            >
              <b>{RANK_LABEL[card.rank]}</b>
              <span>{SUIT_SYMBOL[card.suit]}</span>
              {!result && (
                <small>
                  {snap.discarded.includes(index) ? "교체" : "유지"}
                </small>
              )}
            </button>
          ))}
        </div>
        {result ? (
          <>
            <div className="poker-result">
              <strong>{result.name}</strong>
              <span>보상 유닛 · T1</span>
            </div>
            <div className="reward-row">
              {result.rewards.map((reward, index) => (
                <div
                  key={`${reward.kind}-${index}`}
                  className={`hand-${result.rank}`}
                >
                  <i
                    style={{
                      color: `#${UNITS[reward.kind].color.toString(16)}`,
                    }}
                  >
                    {icons[reward.kind]}
                  </i>
                  <b>{UNITS[reward.kind].name}</b>
                  <small>
                    T{reward.tier} · {SUIT_SYMBOL[reward.suit]} ·{" "}
                    {UNITS[reward.kind].role}
                  </small>
                </div>
              ))}
            </div>
          </>
        ) : null}
        <div className="poker-footer-actions">
          {result ? (
            <GameButton
              variant="primary"
              className="poker-action"
              onClick={() => engine.acceptPokerReward()}
            >
              배치 시작
            </GameButton>
          ) : (
          <GameButton
            variant="primary"
            className="poker-action"
            onClick={() => engine.resolvePoker()}
          >
            {snap.discarded.length
              ? `${snap.discarded.length}장 교체 후 확인`
              : "결과 확인"}
          </GameButton>
          )}
          <GameButton
            variant="secondary"
            className="poker-guide-toggle"
            onClick={() => setShowRewards(true)}
          >
            족보 · 유닛
          </GameButton>
        </div>
        {showRewards && (
          <div className="poker-guide">
            <header>
              <div>
                <b>족보별 유닛</b>
              </div>
              <GameButton variant="icon" onClick={() => setShowRewards(false)} aria-label="닫기">×</GameButton>
            </header>
            <div className="poker-guide-grid">
              {handOrder.map((handRank) => {
                const kind = HAND_UNITS[handRank];
                return (
                  <article key={handRank}>
                    <span>{HAND_PROBABILITY[handRank]}</span>
                    <img
                      src={publicAssetUrl(`assets/units/${UNIT_ASSET_FILES[kind]}.png`)}
                      alt={UNITS[kind].name}
                      draggable={false}
                    />
                    <strong>{HAND_NAMES[handRank]}</strong>
                    <b>{UNITS[kind].name}</b>
                    <small>
                      {HAND_REWARD_COUNT[handRank]}기 · 피해{" "}
                      {UNITS[kind].damage.toLocaleString()}
                      {STRONG_DAMAGE_MULTIPLIERS[kind]
                        ? ` · 강적 ×${STRONG_DAMAGE_MULTIPLIERS[kind]!.toFixed(1)}`
                        : ""}
                    </small>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function WheelModal({ snap }: { snap: Snapshot }) {
  const loot = snap.wheelMode === "loot" ? snap.loot : null;
  const [choice, setChoice] = useState("5"),
    [amount, setAmount] = useState(10),
    [result, setResult] = useState<{
      result: string;
      win: number;
      matched: boolean;
      protected: boolean;
    } | null>(null),
    [spinning, setSpinning] = useState(false);
  const wager = loot?.pot ?? Math.min(amount, snap.points);
  const spin = () => {
    if (spinning) return;
    setSpinning(true);
    const r = engine.spin(choice, wager);
    setTimeout(() => {
      setResult(r);
      setSpinning(false);
    }, 2200);
  };
  return (
    <div className="modal-back">
      <div className="wheel-modal panel">
        <GameButton
          variant="icon"
          className="close"
          onClick={() => engine.closeWheel()}
          aria-label="닫기"
        >
          ×
        </GameButton>
        <p className="eyebrow">BIG SIX</p>
        <h2>{loot ? "전리품 승부" : "룰렛"}</h2>
        {loot && (
          <div className="loot-stake">
            <span>전리품</span>
            <b>{loot.pot} CHIP</b>
            <small>
              {loot.protected
                ? "첫 승부 손실 보호 적용"
                : "안전 회수 시 " + loot.safe + " P"}
            </small>
          </div>
        )}
        <div className={`wheel ${spinning ? "spinning" : ""}`}>
          <div className="wheel-core">
            {result && !spinning ? result.result : "ALL IN"}
          </div>
        </div>
        {result && !spinning ? (
          <>
            <div className={result.win ? "win result" : "result"}>
              {result.matched
                ? `적중! +${result.win.toLocaleString()} P`
                : result.protected
                  ? `손실 보호 +${result.win} P`
                  : "승부 실패 — 전리품을 잃었습니다."}
            </div>
            <div className="result-actions">
              <GameButton variant="primary" onClick={() => engine.closeWheel()}>
                확인
              </GameButton>
            </div>
          </>
        ) : (
          <>
            <div className="choice-row">
              {choices.map((c) => (
                <GameButton
                  variant="option"
                  key={c}
                  className={choice === c ? "active" : ""}
                  onClick={() => setChoice(c)}
                >
                  <b>{c}</b>
                  <small>
                    {odds[c]} · ×{PAYOUT[c]}
                  </small>
                </GameButton>
              ))}
            </div>
            {!loot && (
              <div className="bet-row">
                {[10, 25, 50].map((n) => (
                  <GameButton
                    variant="option"
                    key={n}
                    disabled={snap.points < n}
                    className={amount === n ? "active" : ""}
                    onClick={() => setAmount(n)}
                  >
                    {n}
                  </GameButton>
                ))}
                <GameButton
                  variant="option"
                  onClick={() => setAmount(snap.points)}
                  className={amount === snap.points ? "active" : ""}
                >
                  MAX
                </GameButton>
              </div>
            )}
            <GameButton
              variant="primary"
              className="spin"
              disabled={wager < 10 || spinning}
              onClick={spin}
            >
              {spinning ? "회전 중…" : `돌리기 · ${wager} ${loot ? "CHIP" : "P"}`}
            </GameButton>
            {loot && (
              <GameButton
                variant="secondary"
                className="safe-button"
                onClick={() => engine.secureLoot()}
              >
                회수 · {loot.safe} P
              </GameButton>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Shop({ snap }: { snap: Snapshot }) {
  return (
    <aside className="shop panel">
      <header>
        <span>병력 보급</span>
        <b>{snap.points.toLocaleString()} P</b>
      </header>
      <div className="cards">
        {(Object.entries(UNITS) as [UnitKind, (typeof UNITS)[UnitKind]][]).map(
          ([key, u]) => {
            const price = engine.getPrice(key);
            return (
              <button
                key={key}
                className={
                  snap.placing === key ? "unit-card active" : "unit-card"
                }
                disabled={snap.points < price}
                onClick={() => engine.chooseBuy(key)}
              >
                <i
                  style={{ color: `#${u.color.toString(16).padStart(6, "0")}` }}
                >
                  {icons[key]}
                </i>
                <span>
                  <b>{u.name}</b>
                  <em>{u.role}</em>
                </span>
                <strong>{price}</strong>
              </button>
            );
          },
        )}
      </div>
      <p>
        병종 선택 → 원하는 위치 클릭. 가장 가까운 유효 지점으로 자동 배치됩니다.
      </p>
    </aside>
  );
}

function LootBanner({ snap }: { snap: Snapshot }) {
  if (!snap.loot || snap.state !== "running") return null;
  return (
    <div className="loot-banner panel">
      <div>
        <span>미확보 전리품</span>
        <b>{snap.loot.pot} CHIP</b>
        <small>
          {Math.ceil(snap.loot.expires)}초 후 {snap.loot.safe} P 자동 회수
        </small>
      </div>
      <button onClick={() => engine.secureLoot()}>안전 회수</button>
      <button className="risk" onClick={() => engine.openWheel()}>
        BIG SIX 도전
      </button>
    </div>
  );
}

function BuildControls({
  snap,
  mobileOpen,
  onMobileDismiss,
}: {
  snap: Snapshot;
  mobileOpen: boolean;
  onMobileDismiss: () => void;
}) {
  const [tab, setTab] = useState<
      "structure" | "terrain" | "floor" | "path" | "map"
    >("structure"),
    assets = (
      Object.entries(BUILDINGS) as [
        MapAssetKind,
        (typeof BUILDINGS)[MapAssetKind],
      ][]
    ).filter(([, item]) => item.category === tab);
  const assetGrid = (
    <div className="asset-grid">
      {assets.map(([kind, item]) => {
        const folder =
          item.category === "floor"
            ? "floor"
            : item.category === "terrain"
              ? "terrain"
              : "build";
        const [footprintWidth, footprintHeight] = getMapAssetFootprint(kind);
        return (
          <button
            key={kind}
            className={snap.buildTool === kind ? "active" : ""}
            onClick={() => {
              engine.chooseBuildTool(kind);
              onMobileDismiss();
            }}
          >
            <img src={publicAssetUrl(`assets/${folder}/${kind}.png`)} alt="" />
            <span>{item.name}</span>
            <small className="asset-footprint">
              {footprintWidth}×{footprintHeight} GRID
            </small>
          </button>
        );
      })}
    </div>
  );
  return (
    <div
      className={`build-controls ${mobileOpen ? "mobile-open" : "mobile-closed"}`}
    >
      <div className="build-panel panel">
        <header>
          <span>MAP BUILD</span>
          <b>
            {snap.mapWidth}×{snap.mapHeight} GRID · 자동 저장
          </b>
        </header>
        <nav>
          <button
            className={tab === "structure" ? "active" : ""}
            onClick={() => setTab("structure")}
          >
            건물
          </button>
          <button
            className={tab === "terrain" ? "active" : ""}
            onClick={() => setTab("terrain")}
          >
            지형
          </button>
          <button
            className={tab === "floor" ? "active" : ""}
            onClick={() => setTab("floor")}
          >
            바닥 재질
          </button>
          <button
            className={tab === "path" ? "active" : ""}
            onClick={() => setTab("path")}
          >
            경로
          </button>
          <button
            className={tab === "map" ? "active" : ""}
            onClick={() => setTab("map")}
          >
            맵 크기
          </button>
        </nav>
        <button
          className="quick-add-entrance"
          data-testid="add-entrance"
          disabled={snap.pathEditing}
          onClick={() => {
            setTab("path");
            engine.beginPathEdit(true);
            onMobileDismiss();
          }}
        >
          <span>＋ 입구 추가</span>
          <small>
            {snap.pathEditing
              ? "현재 경로 편집 중"
              : `현재 ${snap.routes.length}개 입구 · 기존 길에 스냅 연결`}
          </small>
        </button>
        {tab === "structure" || tab === "terrain" ? (
          <>{assetGrid}</>
        ) : tab === "floor" ? (
          <>
            {assetGrid}
            <div className="floor-actions">
              <button
                disabled={
                  !snap.buildTool ||
                  BUILDINGS[snap.buildTool as MapAssetKind]?.category !==
                    "floor"
                }
                onClick={() => engine.fillFloor(snap.buildTool as FloorKind)}
              >
                선택 재질로 전체 채우기
              </button>
              <button onClick={() => engine.clearFloor()}>
                전체 바닥 비우기
              </button>
            </div>
          </>
        ) : tab === "path" ? (
          <div className="path-editor">
            <strong>입구 및 이동 경로</strong>
            <p>
              입구별 적 투입 시작 PHASE를 설정하세요. 새 입구는 기존 길에
              스냅해 하나의 출구를 공유합니다.
            </p>
            <div className="route-list">
              {snap.routes.map((route, index) => {
                const startPhase = snap.routeStartPhases[index] ?? 1;
                return (
                <div
                  key={index}
                  className={`route-card ${snap.activeRoute === index ? "active" : ""}`}
                >
                  <button
                    className="route-select"
                    disabled={snap.pathEditing}
                    onClick={() => engine.selectRoute(index)}
                  >
                    <span>
                      <b>입구 {index + 1}</b>
                      <small>{route.length}개 경로 지점</small>
                    </span>
                    <em>PHASE {startPhase}부터</em>
                  </button>
                  <div className="route-phase-setting">
                    <span>등장 시작</span>
                    <button
                      aria-label={`입구 ${index + 1} 시작 PHASE 감소`}
                      disabled={snap.pathEditing || startPhase <= 1}
                      onClick={() =>
                        engine.setRouteStartPhase(index, startPhase - 1)
                      }
                    >
                      −
                    </button>
                    <b>{startPhase}</b>
                    <button
                      aria-label={`입구 ${index + 1} 시작 PHASE 증가`}
                      disabled={snap.pathEditing}
                      onClick={() =>
                        engine.setRouteStartPhase(index, startPhase + 1)
                      }
                    >
                      ＋
                    </button>
                  </div>
                </div>
              );})}
            </div>
            {snap.pathEditing ? (
              <>
                <b>
                  {snap.pathPoints.length === 0
                    ? "① 새 입구 위치를 전장에서 클릭하세요"
                    : "② 경유지를 찍고 기존 길 가까이를 클릭해 합류하세요"}
                </b>
                <small className="path-progress">
                  입구 {snap.activeRoute + 1} · {snap.pathPoints.length}개 지점
                </small>
                <div>
                  <button onClick={() => engine.undoPathPoint()}>
                    마지막 취소
                  </button>
                  <button onClick={() => engine.cancelPathEdit()}>
                    편집 취소
                  </button>
                  <button
                    className="save"
                    disabled={snap.pathPoints.length < 2}
                    onClick={() => engine.finishPathEdit()}
                  >
                    경로 저장
                  </button>
                </div>
              </>
            ) : (
              <div className="route-actions">
                <button
                  onClick={() => {
                    engine.beginPathEdit(false);
                    onMobileDismiss();
                  }}
                >
                  선택 입구 경로 다시 그리기
                </button>
                <button
                  className="move-exit"
                  onClick={() => {
                    engine.beginExitMove();
                    onMobileDismiss();
                  }}
                >
                  ◎ 출구 위치 변경
                </button>
                <button
                  disabled={snap.routes.length <= 1}
                  onClick={() => engine.deleteRoute(snap.activeRoute)}
                >
                  선택 경로 삭제
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="map-size">
            <strong>맵 GRID 크기</strong>
            <p>
              최대 200×160까지 확장할 수 있습니다. 맵을 키워도 카메라 배율과
              위치는 그대로 유지됩니다.
            </p>
            <div>
              <span>가로</span>
              <button
                onClick={() =>
                  engine.resizeMap(snap.mapWidth - 8, snap.mapHeight)
                }
              >
                −
              </button>
              <b>{snap.mapWidth}</b>
              <button
                onClick={() =>
                  engine.resizeMap(snap.mapWidth + 8, snap.mapHeight)
                }
              >
                ＋
              </button>
            </div>
            <div>
              <span>세로</span>
              <button
                onClick={() =>
                  engine.resizeMap(snap.mapWidth, snap.mapHeight - 8)
                }
              >
                −
              </button>
              <b>{snap.mapHeight}</b>
              <button
                onClick={() =>
                  engine.resizeMap(snap.mapWidth, snap.mapHeight + 8)
                }
              >
                ＋
              </button>
            </div>
            <div className="size-presets">
              <button onClick={() => engine.resizeMap(36, 28)}>소형</button>
              <button onClick={() => engine.resizeMap(52, 46)}>기본</button>
              <button onClick={() => engine.resizeMap(100, 80)}>확장</button>
              <button onClick={() => engine.resizeMap(160, 120)}>대형</button>
              <button onClick={() => engine.resizeMap(200, 160)}>최대</button>
            </div>
          </div>
        )}
        <button
          className={
            snap.buildTool === "erase" ? "demolish active" : "demolish"
          }
          onClick={() => {
            engine.chooseBuildTool("erase");
            onMobileDismiss();
          }}
        >
          ✕ 개별 에셋 삭제 · 클릭 또는 드래그
        </button>
        <small>
          삭제 모드는 건물·지형을 먼저 제거하며, 빈 GRID에서는 바닥도 한 칸씩
          제거합니다. 가운데·오른쪽 또는 Shift+드래그로 맵을 이동하세요.
        </small>
      </div>
    </div>
  );
}

function MapPreview({ map }: { map: StoredMap }) {
  return (
    <svg
      className="map-preview"
      viewBox={`0 0 ${map.width} ${map.height}`}
      role="img"
      aria-label={`${map.name} 전장 미니맵`}
    >
      <rect width={map.width} height={map.height} rx="2" fill="#08151d" />
      {map.objects
        .filter((object) => !object.kind.startsWith("floor_"))
        .slice(0, 90)
        .map((object, index) => (
          <circle
            key={`${object.kind}-${object.x}-${object.y}-${index}`}
            cx={object.x}
            cy={object.y}
            r="0.55"
            fill={object.kind.includes("lamp") ? "#55e8d0" : "#405866"}
            opacity="0.72"
          />
        ))}
      {map.routes.map((route, index) => (
        <polyline
          key={index}
          points={route.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          stroke={index === 0 ? "#efb267" : "#9a7ad8"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {map.routes.map((route, index) => (
        <circle
          key={`entrance-${index}`}
          cx={route[0]?.[0] ?? 0}
          cy={route[0]?.[1] ?? 0}
          r="1.35"
          fill="#e16255"
          stroke="#ffd0a8"
          strokeWidth="0.45"
        />
      ))}
      {map.routes[0]?.at(-1) && (
        <circle
          cx={map.routes[0].at(-1)![0]}
          cy={map.routes[0].at(-1)![1]}
          r="1.5"
          fill="#35d8c0"
          stroke="#c9fff3"
          strokeWidth="0.45"
        />
      )}
    </svg>
  );
}

function RankingModal({
  map,
  scores,
  onClose,
}: {
  map: StoredMap | null;
  scores: ScoreRecord[];
  onClose: () => void;
}) {
  return (
    <div className="modal-back ranking-back">
      <section className="ranking-modal panel" role="dialog" aria-modal="true">
        <header>
          <div>
            <h2>로컬 랭킹</h2>
            <small>{map?.name ?? "선택된 맵 없음"}</small>
          </div>
          <GameButton variant="icon" onClick={onClose} aria-label="닫기">×</GameButton>
        </header>
        {scores.length ? (
          <ol className="ranking-list">
            {scores.slice(0, 10).map((score, index) => (
              <li key={score.id} className={index === 0 ? "rank-first" : ""}>
                <strong>{String(index + 1).padStart(2, "0")}</strong>
                <div>
                  <b>{score.kills.toLocaleString()} KILLS</b>
                  <span>PHASE {score.phase} · {Math.floor(score.elapsedSeconds / 60)}:{String(Math.floor(score.elapsedSeconds % 60)).padStart(2, "0")}</span>
                </div>
                <time>{new Date(score.playedAt).toLocaleDateString("ko-KR")}</time>
              </li>
            ))}
          </ol>
        ) : (
          <div className="ranking-empty">
            <span>◇</span>
            <b>기록 없음</b>
          </div>
        )}
      </section>
    </div>
  );
}

function MapLibrary({
  maps,
  current,
  scores,
  disabled,
  onSelect,
}: {
  maps: StoredMap[];
  current: StoredMap | null;
  scores: ScoreRecord[];
  disabled: boolean;
  onSelect: (map: StoredMap) => void;
}) {
  const sortedMaps = sortBattlefieldsByName(maps),
    rowRef = useRef<HTMLDivElement>(null),
    currentIndex = current
      ? sortedMaps.findIndex((map) => map.id === current.id)
      : -1,
    move = (direction: -1 | 1) => {
      if (!sortedMaps.length || disabled) return;
      onSelect(
        sortedMaps[
          circularIndex(currentIndex, sortedMaps.length, direction)
        ],
      );
    };

  useEffect(() => {
    rowRef.current
      ?.querySelector<HTMLElement>(".map-card.active")
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [current?.id]);

  return (
    <section className="map-library" aria-label="전장 선택">
      <div className="map-library-heading">
        <div>
          <b>전장 선택</b>
        </div>
        {current && <strong>BEST {scores[0]?.kills.toLocaleString() ?? 0}</strong>}
      </div>
      <div className="map-carousel">
        <GameButton
          variant="icon"
          className="map-carousel-arrow"
          aria-label="이전 전장"
          disabled={disabled || sortedMaps.length < 2}
          onClick={() => move(-1)}
        >
          ‹
        </GameButton>
        <div
          className="map-card-row"
          ref={rowRef}
          onWheel={(event) => {
            if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
              event.currentTarget.scrollBy({ left: event.deltaY, behavior: "smooth" });
            }
          }}
        >
          {sortedMaps.map((map) => (
            <button
              key={map.id}
              className={current?.id === map.id ? "map-card active" : "map-card"}
              onClick={() => onSelect(map)}
              disabled={disabled}
            >
              <MapPreview map={map} />
              <span>
                <b>{map.name}</b>
                <small>{map.width}×{map.height} · 입구 {map.routes.length}</small>
              </span>
            </button>
          ))}
        </div>
        <GameButton
          variant="icon"
          className="map-carousel-arrow"
          aria-label="다음 전장"
          disabled={disabled || sortedMaps.length < 2}
          onClick={() => move(1)}
        >
          ›
        </GameButton>
      </div>
      {sortedMaps.length > 1 && (
        <span className="map-carousel-count">
          {Math.max(0, currentIndex) + 1} / {sortedMaps.length}
        </span>
      )}
    </section>
  );
}

function BuilderMapTools({
  maps,
  current,
  mobileOpen,
  onSelect,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
  onExport,
  onImport,
}: {
  maps: StoredMap[];
  current: StoredMap | null;
  mobileOpen: boolean;
  onSelect: (map: StoredMap) => void;
  onCreate: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  return (
    <aside
      className={`builder-map-tools panel ${mobileOpen ? "mobile-open" : "mobile-closed"}`}
      aria-label="맵 파일 관리"
    >
      <header>
        <span>MAP FILE</span>
        <b>{current ? `${current.name} 편집 중` : "맵 선택"}</b>
      </header>
      <div className="builder-map-list" aria-label="저장된 맵 목록">
        <button className="builder-new-map" onClick={onCreate}>
          <i aria-hidden="true">＋</i>
          <span>
            <b>새 전장</b>
            <small>빈 맵에서 시작</small>
          </span>
        </button>
        {sortBattlefieldsByName(maps).map((map) => (
          <button
            key={map.id}
            className={current?.id === map.id ? "builder-map-card active" : "builder-map-card"}
            onClick={() => onSelect(map)}
            aria-current={current?.id === map.id ? "true" : undefined}
          >
            <MapPreview map={map} />
            <span>
              <b>{map.name}</b>
              <small>
                {map.width}×{map.height} · 입구 {map.routes.length}
              </small>
            </span>
            {current?.id === map.id && <em>편집 중</em>}
          </button>
        ))}
      </div>
      {current && (
        <>
          <label className="map-name-field">
            <span>맵 이름</span>
            <input
              value={current.name}
              onChange={(event) => onRename(event.target.value)}
            />
          </label>
          <div className="builder-file-actions">
            <GameButton onClick={onDuplicate}>복제</GameButton>
            <GameButton onClick={onExport}>JSON 저장</GameButton>
            <label className="map-import-button">
              JSON 불러오기
              <input
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onImport(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <GameButton
              variant="danger"
              className="map-delete"
              onClick={onDelete}
              disabled={maps.length <= 1}
            >
              삭제
            </GameButton>
          </div>
        </>
      )}
    </aside>
  );
}

export function App() {
  const shell = useRef<HTMLElement>(null),
    host = useRef<HTMLDivElement>(null),
    [snap, setSnap] = useState(() => engine.getSnapshot()),
    [showEnemyGuide, setShowEnemyGuide] = useState(false),
    [showRanking, setShowRanking] = useState(false),
    [soundEnabled, setSoundEnabled] = useState(gameAudio.enabled),
    [soundVolume, setSoundVolume] = useState(gameAudio.volume),
    [showVolume, setShowVolume] = useState(false),
    [showExitConfirm, setShowExitConfirm] = useState(false),
    [exitSaving, setExitSaving] = useState(false),
    [exitError, setExitError] = useState(""),
    [builderPanel, setBuilderPanel] = useState<"tools" | "files" | null>(null),
    [maps, setMaps] = useState<StoredMap[]>([]),
    [currentMap, setCurrentMap] = useState<StoredMap | null>(null),
    [scores, setScores] = useState<ScoreRecord[]>([]),
    [storageReady, setStorageReady] = useState(false),
    [storageError, setStorageError] = useState("");
  const currentMapRef = useRef<StoredMap | null>(null),
    defeatRecorded = useRef(false),
    builderRevisedMaps = useRef(new Set<string>());
  useEffect(() => engine.subscribe(() => setSnap(engine.getSnapshot())), []);
  useEffect(
    () =>
      gameAudio.subscribe((enabled, volume) => {
        setSoundEnabled(enabled);
        setSoundVolume(volume);
      }),
    [],
  );
  useEffect(() => {
    const unlock = () => void gameAudio.unlock();
    const unlockAfterVisibility = () => {
      if (document.visibilityState === "visible") void gameAudio.unlock();
    };
    const touchOptions: AddEventListenerOptions = {
      capture: true,
      passive: true,
    };
    // Keep these listeners active: iOS can interrupt Web Audio after the app
    // is backgrounded, so the next accepted gesture must resume it again.
    window.addEventListener("pointerdown", unlock, touchOptions);
    window.addEventListener("touchend", unlock, touchOptions);
    window.addEventListener("keydown", unlock, true);
    document.addEventListener("visibilitychange", unlockAfterVisibility);
    return () => {
      window.removeEventListener("pointerdown", unlock, touchOptions);
      window.removeEventListener("touchend", unlock, touchOptions);
      window.removeEventListener("keydown", unlock, true);
      document.removeEventListener("visibilitychange", unlockAfterVisibility);
    };
  }, []);
  useEffect(() => gameAudio.setMode(snap.state), [snap.state]);
  useEffect(() => {
    if (snap.state !== "builder") {
      setBuilderPanel(null);
      builderRevisedMaps.current.clear();
    }
  }, [snap.state]);
  useEffect(() => {
    const closeOverlay = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShowEnemyGuide(false);
      setShowRanking(false);
      setShowVolume(false);
      if (showExitConfirm && !exitSaving) {
        setShowExitConfirm(false);
        setExitError("");
        engine.setPaused(false);
      }
    };
    window.addEventListener("keydown", closeOverlay);
    return () => window.removeEventListener("keydown", closeOverlay);
  }, [showExitConfirm, exitSaving]);
  useEffect(() => {
    if (!showVolume) return;
    const closeVolume = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest(".sound-control")) return;
      setShowVolume(false);
    };
    window.addEventListener("pointerdown", closeVolume);
    return () => window.removeEventListener("pointerdown", closeVolume);
  }, [showVolume]);
  useEffect(() => {
    let cancelled = false;
    initializeMaps(engine.exportMapData())
      .then(async ({ maps: storedMaps, current }) => {
        if (cancelled) return;
        currentMapRef.current = current;
        setMaps(storedMaps);
        setCurrentMap(current);
        engine.applyMapData(current);
        const mapScores = await getMapScores(current.id, current.revision);
        if (cancelled) return;
        setScores(mapScores);
        engine.setBestKills(mapScores[0]?.kills ?? 0);
        setStorageReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStorageError(error instanceof Error ? error.message : "저장소를 열 수 없습니다.");
        setStorageReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    currentMapRef.current = currentMap;
  }, [currentMap]);
  useEffect(
    () =>
      engine.subscribeMap((data) => {
        const selectedMap = currentMapRef.current;
        if (!selectedMap) return;
        const updated: StoredMap = {
          ...selectedMap,
          ...data,
          updatedAt: Date.now(),
        };
        currentMapRef.current = updated;
        setCurrentMap(updated);
        setMaps((items) =>
          items.map((item) => (item.id === updated.id ? updated : item)),
        );
        void saveStoredMap(updated);
      }),
    [],
  );
  useEffect(() => {
    if (snap.state !== "defeat") {
      defeatRecorded.current = false;
      return;
    }
    const selectedMap = currentMapRef.current;
    if (!selectedMap || defeatRecorded.current) return;
    defeatRecorded.current = true;
    void addScore({
      mapId: selectedMap.id,
      mapRevision: selectedMap.revision,
      kills: snap.kills,
      phase: snap.phase,
      elapsedSeconds: snap.elapsed,
    }).then(async () => {
      const nextScores = await getMapScores(selectedMap.id, selectedMap.revision);
      setScores(nextScores);
      engine.setBestKills(nextScores[0]?.kills ?? 0);
    });
  }, [snap.state, snap.kills, snap.phase, snap.elapsed]);
  useEffect(() => {
    if (!host.current) return;
    let dispose: (() => void) | undefined,
      cancel = false;
    mountBoard(host.current, engine).then((d) =>
      cancel ? d() : (dispose = d),
    );
    return () => {
      cancel = true;
      dispose?.();
    };
  }, []);
  const selectMap = async (map: StoredMap, forBuilder = false) => {
      const editing = forBuilder && snap.state === "builder";
      if (snap.state !== "ready" && !editing) return;
      let selectedMap = map;
      if (editing && !builderRevisedMaps.current.has(map.id)) {
        selectedMap = {
          ...map,
          revision: map.revision + 1,
          updatedAt: Date.now(),
        };
        builderRevisedMaps.current.add(map.id);
        await saveStoredMap(selectedMap);
        setMaps((items) =>
          items.map((item) => (item.id === selectedMap.id ? selectedMap : item)),
        );
      }
      currentMapRef.current = selectedMap;
      setCurrentMap(selectedMap);
      engine.applyMapData(selectedMap);
      await setCurrentMapId(selectedMap.id);
      const nextScores = editing
        ? []
        : await getMapScores(selectedMap.id, selectedMap.revision);
      setScores(nextScores);
      engine.setBestKills(nextScores[0]?.kills ?? 0);
    },
    renameMap = (name: string) => {
      if (!currentMap) return;
      const updated = { ...currentMap, name, updatedAt: Date.now() };
      currentMapRef.current = updated;
      setCurrentMap(updated);
      setMaps((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      void saveStoredMap(updated);
    },
    duplicateMap = async () => {
      if (!currentMap) return;
      const copy = createStoredMap(`${currentMap.name} 복사본`, currentMap);
      await saveStoredMap(copy);
      setMaps(await listMaps());
      if (snap.state === "builder") builderRevisedMaps.current.add(copy.id);
      await selectMap(copy, snap.state === "builder");
    },
    createBlankMap = async () => {
      const existingNames = new Set(maps.map((map) => map.name));
      let number = maps.length + 1,
        name = `새 전장 ${number}`;
      while (existingNames.has(name)) name = `새 전장 ${++number}`;
      const blank = createStoredMap(name, {
        width: 52,
        height: 46,
        seed: Date.now() >>> 0,
        objects: [],
        routes: [
          [
            [2, 23],
            [26, 23],
            [50, 23],
          ],
        ],
        routeStartPhases: [1],
      });
      await saveStoredMap(blank);
      builderRevisedMaps.current.add(blank.id);
      setMaps(await listMaps());
      await selectMap(blank, true);
      engine.setMessage(`${blank.name} 맵을 새로 만들었습니다`, 3);
    },
    removeMap = async () => {
      if (!currentMap || maps.length <= 1) return;
      if (!window.confirm(`“${currentMap.name}” 맵과 해당 랭킹 기록을 삭제할까요?`)) return;
      await deleteStoredMap(currentMap.id);
      const remaining = await listMaps();
      setMaps(remaining);
      await selectMap(remaining[0], snap.state === "builder");
    },
    downloadMap = () => {
      if (!currentMap) return;
      const blob = new Blob([exportMapJson(currentMap)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${currentMap.name.replace(/[^a-zA-Z0-9가-힣_-]+/g, "-")}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    uploadMap = async (file: File) => {
      try {
        const imported = importMapJson(await file.text());
        await saveStoredMap(imported);
        setMaps(await listMaps());
        if (snap.state === "builder") builderRevisedMaps.current.add(imported.id);
        await selectMap(imported, snap.state === "builder");
        engine.setMessage("맵 JSON을 불러왔습니다.");
      } catch (error) {
        engine.setMessage(error instanceof Error ? error.message : "맵을 불러오지 못했습니다.", 5);
      }
    },
    openBuilder = async () => {
      builderRevisedMaps.current.clear();
      if (!currentMap) {
        engine.enterBuilder();
        return;
      }
      const revised = { ...currentMap, revision: currentMap.revision + 1, updatedAt: Date.now() };
      currentMapRef.current = revised;
      setCurrentMap(revised);
      setMaps((items) => items.map((item) => (item.id === revised.id ? revised : item)));
      setScores([]);
      engine.setBestKills(0);
      builderRevisedMaps.current.add(revised.id);
      await saveStoredMap(revised);
      engine.enterBuilder();
    };
  const requestExitToHome = () => {
      setExitError("");
      setShowVolume(false);
      setShowExitConfirm(true);
      engine.setPaused(true);
    },
    cancelExitToHome = () => {
      if (exitSaving) return;
      setShowExitConfirm(false);
      setExitError("");
      engine.setPaused(false);
    },
    exitToHome = async () => {
    const selectedMap = currentMapRef.current,
      finalSnapshot = engine.getSnapshot();
    if (!selectedMap || finalSnapshot.state === "ready") return;
    setExitSaving(true);
    setExitError("");
    try {
      await addScore({
        mapId: selectedMap.id,
        mapRevision: selectedMap.revision,
        kills: finalSnapshot.kills,
        phase: finalSnapshot.phase,
        elapsedSeconds: finalSnapshot.elapsed,
      });
      const nextScores = await getMapScores(selectedMap.id, selectedMap.revision);
      setScores(nextScores);
      engine.setBestKills(nextScores[0]?.kills ?? 0);
      setShowEnemyGuide(false);
      setShowRanking(false);
      setShowVolume(false);
      setShowExitConfirm(false);
      engine.reset();
    } catch {
      setExitError("랭킹 기록을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setExitSaving(false);
    }
  };
  const selected = snap.selectedUnit,
    grade =
      snap.kills >= 1000
        ? "S"
        : snap.kills >= 500
          ? "A"
          : snap.kills >= 200
            ? "B"
            : "C";
  const activeBuilderTool =
    snap.buildTool === "erase"
      ? "삭제"
      : snap.buildTool === "path"
        ? "경로"
        : snap.buildTool === "exit"
          ? "출구 이동"
          : snap.buildTool
            ? BUILDINGS[snap.buildTool].name
            : "편집 도구";
  return (
    <main
      className={
        snap.state === "builder" ? "game-shell builder-shell" : "game-shell"
      }
      ref={shell}
    >
      <div className="board" ref={host} />
      <div className="grain" />
      {snap.state === "ready" && (
        <nav className="global-tools ready-tools panel" aria-label=" 설정">
          <SoundControl
            enabled={soundEnabled}
            volume={soundVolume}
            open={showVolume}
            onToggle={() => {
              void gameAudio.unlock();
              setShowVolume((visible) => !visible);
            }}
          />
        </nav>
      )}
      {snap.state !== "ready" && snap.state !== "poker" && (
        <div className="zoom-controls panel" aria-label="카메라 확대와 축소">
          <button
            title="축소"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("game-camera-zoom", { detail: -1 }),
              )
            }
          >
            −
          </button>
          <button
            className="zoom-reset"
            title="기본 배율"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("game-camera-zoom", { detail: 0 }),
              )
            }
          >
            100%
          </button>
          <button
            title="확대"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("game-camera-zoom", { detail: 1 }),
              )
            }
          >
            +
          </button>
        </div>
      )}
      {snap.state !== "builder" && (
        <header className="top-hud panel">
          <div className="brand">
            <span className="brand-mark">A</span>
            <div>
              <b>ALL-IN</b>
              <small>DEFENSE</small>
            </div>
          </div>
          <div className="metrics">
            <div className="phase-stat">
              <span>PHASE</span>
              <b>
                {snap.phase}
                <small> / ∞</small>
              </b>
            </div>
            <div className="time-stat">
              <span>PLAY TIME</span>
              <b>{formatPlayTime(snap.elapsed)}</b>
            </div>
            <div className="spawn-stat">
              <span>
                {snap.state === "running"
                  ? `포커 ${Math.ceil(snap.phaseTimeRemaining)}초`
                  : "남은 병력"}
              </span>
              <b>
                {snap.remaining}
                <small> / {snap.phaseTotal || "-"}</small>
              </b>
            </div>
            <div className="active-stat">
              <span>전장 잔존</span>
              <b>{snap.active}</b>
            </div>
            <div className="kill-stat">
              <span>랭킹 처치</span>
              <b>
                {snap.kills}
                <small> BEST {snap.bestKills}</small>
              </b>
            </div>
            <div
              key={`gate-${snap.gate}`}
              className={`gate-stat${
                snap.gate >= 15 ? " danger" : snap.gate > 0 ? " damaged" : ""
              }`}
            >
              <span>{snap.gate >= 15 ? "게이트 위험" : "게이트 손상"}</span>
              <b>
                {snap.gate}
                <small> / 20</small>
              </b>
              <i className="gate-meter" aria-hidden="true">
                <i style={{ width: `${Math.min(100, snap.gate * 5)}%` }} />
              </i>
            </div>
          </div>
          {snap.state !== "ready" && (
            <nav className="hud-actions" aria-label="게임 메뉴">
              <button
                className="home-action"
                title="기록을 저장하고 홈으로"
                onClick={requestExitToHome}
              >
                <span aria-hidden="true">⌂</span>
                <b>홈</b>
              </button>
              <button
                title="적 유닛 도감"
                onClick={() => {
                  setShowRanking(false);
                  setShowEnemyGuide(true);
                }}
              >
                <span aria-hidden="true">◎</span>
                <b>적 도감</b>
              </button>
              <button
                title="현재 전장 로컬 랭킹"
                onClick={() => {
                  setShowEnemyGuide(false);
                  setShowRanking(true);
                }}
              >
                <span aria-hidden="true">▥</span>
                <b>랭킹</b>
              </button>
              {snap.state === "running" && (
                <button
                  className={snap.paused ? "pause-action active" : "pause-action"}
                  title={snap.paused ? "전투 재개" : "전투 일시정지"}
                  aria-label={snap.paused ? "전투 재개" : "전투 일시정지"}
                  onClick={() => engine.setPaused(!snap.paused)}
                >
                  <span aria-hidden="true">{snap.paused ? "▶" : "Ⅱ"}</span>
                  <b>{snap.paused ? "재개" : "일시정지"}</b>
                </button>
              )}
              {snap.state === "running" && (
                <button
                  className={
                    snap.timeScale > 1 ? "speed-action active" : "speed-action"
                  }
                  title={`현재 ${snap.timeScale}배속 · 눌러서 ${snap.timeScale === 1 ? 2 : snap.timeScale === 2 ? 4 : 1}배속으로 전환`}
                  aria-label={`전투 속도 ${snap.timeScale}배속. 다음 속도로 전환`}
                  onClick={() => engine.toggleTimeScale()}
                >
                  <span aria-hidden="true">{snap.timeScale}×</span>
                  <b>배속</b>
                </button>
              )}
              <SoundControl
                enabled={soundEnabled}
                volume={soundVolume}
                open={showVolume}
                onToggle={() => {
                  void gameAudio.unlock();
                  setShowVolume((visible) => !visible);
                }}
              />
            </nav>
          )}
        </header>
      )}
      {snap.state === "running" && snap.paused && !showExitConfirm && (
        <div className="pause-overlay" role="dialog" aria-label="전투 일시정지">
          <div className="pause-card panel">
            <span className="eyebrow">COMBAT PAUSED</span>
            <h2>전투 일시정지</h2>
            <p>전장의 모든 움직임과 공격이 멈췄습니다.</p>
            <button className="primary" onClick={() => engine.setPaused(false)}>
              전투 재개
            </button>
          </div>
        </div>
      )}
      {snap.state === "running" && (
        <div className="group-banner">
          <span>적 투입 진행</span>
          <b>
            PHASE {snap.phase} · {snap.phaseSpawned}/{snap.phaseTotal}
          </b>
          <i />
          <span>이전 적 유지</span>
          <b>{snap.active}기 잔존</b>
        </div>
      )}
      {snap.state === "builder" && (
        <>
          <div className="editor-header panel">
            <div>
              <b>MAP BUILDER</b>
              <span>정사각형 탑다운 GRID · 건물 · 지형 · 적 이동 경로</span>
            </div>
            <button
              onClick={() => {
                setBuilderPanel(null);
                engine.exitBuilder();
              }}
            >
              저장하고 홈으로
            </button>
          </div>
          <nav className="builder-mobile-dock panel" aria-label="맵 편집 도구">
            <button
              className={builderPanel === "tools" ? "active" : ""}
              onClick={() =>
                setBuilderPanel((panel) => (panel === "tools" ? null : "tools"))
              }
            >
              <span aria-hidden="true">▦</span>
              <b>{activeBuilderTool}</b>
            </button>
            <button
              className={builderPanel === "files" ? "active" : ""}
              onClick={() =>
                setBuilderPanel((panel) => (panel === "files" ? null : "files"))
              }
            >
              <span aria-hidden="true">▤</span>
              <b>맵 파일</b>
            </button>
          </nav>
          {snap.pathEditing && (
            <div className="builder-path-bar panel">
              <b>경로 {snap.pathPoints.length}개 지점</b>
              <button onClick={() => engine.undoPathPoint()}>되돌리기</button>
              <button onClick={() => engine.cancelPathEdit()}>취소</button>
              <button
                className="save"
                disabled={snap.pathPoints.length < 2}
                onClick={() => engine.finishPathEdit()}
              >
                저장
              </button>
            </div>
          )}
          <BuildControls
            snap={snap}
            mobileOpen={builderPanel === "tools"}
            onMobileDismiss={() => setBuilderPanel(null)}
          />
          <BuilderMapTools
            maps={maps}
            current={currentMap}
            mobileOpen={builderPanel === "files"}
            onSelect={(map) => void selectMap(map, true)}
            onCreate={() => void createBlankMap()}
            onRename={renameMap}
            onDuplicate={() => void duplicateMap()}
            onDelete={() => void removeMap()}
            onExport={downloadMap}
            onImport={(file) => void uploadMap(file)}
          />
        </>
      )}
      {snap.state === "deploy" && snap.placing && (
        <div className="deploy-guide">
          <span>전장 일시정지 · 포커 보상 배치</span>
          <b>
            {UNITS[snap.placing].name} · T{snap.pendingUnits[0]?.tier}
          </b>
          <strong>{snap.pendingUnits.length}기 남음</strong>
        </div>
      )}
      {snap.state === "deploy" && !snap.pendingUnits.length && (
        <div className="phase-ready panel">
          <span>전장 일시정지 · 잔존 적 {snap.active}기</span>
          <b>PHASE {snap.phase + 1} 준비 완료</b>
          <button
            className="primary phase-start-cta"
            onClick={() => engine.startPhase()}
          >
            <span>
              적 투입 시작 <i>→</i>
            </span>
            <small>지금 눌러 전투 재개</small>
          </button>
        </div>
      )}
      {snap.state !== "builder" && (
        <div className="right-stack">
          <Minimap snap={snap} />
          <EntranceSchedule snap={snap} />
          <div className="mission panel">
            <span>POKER DEFENSE</span>
            <b>PHASE {snap.phase || 1} 전선 유지</b>
            <small>
              처치 {snap.kills} · 병력 {snap.units} · 잔존 적 {snap.active}
            </small>
            <div>
              <i
                style={{
                  width: `${((snap.phase % 10) / 10) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}
      {selected && (
        <div className="selection panel">
          <div
            className="portrait"
            style={{ color: `#${UNITS[selected.kind].color.toString(16)}` }}
          >
            {icons[selected.kind]}
          </div>
          <div className="selection-unit-info">
            <div className="selection-heading">
              <span>선택 병력</span>
              <b>
                {UNITS[selected.kind].name} · T{selected.tier}
              </b>
            </div>
            <div className="selection-stats" aria-label="선택 병력 능력치">
              <span>
                <i>공격력</i>
                <strong>
                  {getUnitDamage(selected.kind, selected.tier).toLocaleString()}
                </strong>
              </span>
              <span>
                <i>공속</i>
                <strong>{UNITS[selected.kind].rate.toFixed(2)}/초</strong>
              </span>
              <span>
                <i>사거리</i>
                <strong>{engine.getUnitRange(selected).toFixed(1)}</strong>
              </span>
              <span className="selection-stat-total">
                <i>누적</i>
                <strong>{Math.round(selected.damageDone).toLocaleString()}</strong>
              </span>
            </div>
          </div>
          <button onClick={() => engine.mergeSelected()}>합성</button>
        </div>
      )}
      {!selected && snap.selectedCount > 1 && (
        <div className="selection multi panel">
          <div className="portrait">◇</div>
          <div>
            <span>다중 선택</span>
            <b>{snap.selectedCount}기 지휘 중</b>
            <small>지면을 클릭하면 대형을 유지하며 이동합니다.</small>
          </div>
          <button onClick={() => engine.selectUnits([])}>선택 해제</button>
        </div>
      )}
      {snap.tutorial && snap.state === "running" && !snap.loot && (
        <div className="tutorial-tip">
          <i>!</i>
          <span>{snap.tutorial}</span>
        </div>
      )}
      {snap.message && <div className="toast">{snap.message}</div>}
      {snap.state === "ready" && (
        <div className="intro modal-back">
          <div className="intro-card">
            <img
              className="main-game-logo"
              src={publicAssetUrl("assets/ui/all-in-defense-logo-transparent-v3.webp")}
              alt="ALL-IN DEFENSE"
            />
            <MapLibrary
              maps={maps}
              current={currentMap}
              scores={scores}
              disabled={!storageReady}
              onSelect={(map) => void selectMap(map)}
            />
            {storageError && <p className="storage-error">{storageError} · 현재 전장으로 계속 플레이할 수 있습니다.</p>}
            <div className="home-image-actions">
              <button
                className="home-image-action home-play"
                disabled={!storageReady}
                onClick={async () => {
                  await enterMobileLandscape(shell.current);
                  engine.start();
                }}
              >
                <img src={publicAssetUrl("assets/ui/menu-play.jpg")} alt="" />
                <span>게임 시작</span>
              </button>
              <button
                className="home-image-action home-build"
                disabled={!storageReady}
                onClick={() => void openBuilder()}
              >
                <img src={publicAssetUrl("assets/ui/menu-builder.jpg")} alt="" />
                <span>MAP BUILD</span>
              </button>
              <button
                className="home-image-action home-ranking"
                onClick={() => setShowRanking(true)}
              >
                <img src={publicAssetUrl("assets/ui/menu-ranking.jpg")} alt="" />
                <span>LOCAL RANKING</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {showEnemyGuide && (
        <EnemyGuide snap={snap} onClose={() => setShowEnemyGuide(false)} />
      )}
      {showRanking && (
        <RankingModal map={currentMap} scores={scores} onClose={() => setShowRanking(false)} />
      )}
      {showExitConfirm && (
        <div className="modal-back exit-confirm-back" role="presentation">
          <section
            className="exit-confirm-card panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exit-confirm-title"
          >
            <span className="eyebrow">OPERATION RECORD</span>
            <h2 id="exit-confirm-title">작전을 종료할까요?</h2>
            <p>현재 전투 기록을 저장하고 전장 선택 화면으로 돌아갑니다.</p>
            <div className="exit-record-grid">
              <div><span>처치</span><b>{snap.kills.toLocaleString()}</b></div>
              <div><span>PHASE</span><b>{snap.phase}</b></div>
              <div><span>작전 시간</span><b>{formatPlayTime(snap.elapsed)}</b></div>
            </div>
            <small>이 기록은 현재 전장의 LOCAL RANKING에 반영됩니다.</small>
            {exitError && <p className="exit-error">{exitError}</p>}
            <div className="exit-confirm-actions">
              <GameButton
                variant="secondary"
                disabled={exitSaving}
                onClick={cancelExitToHome}
              >
                계속 플레이
              </GameButton>
              <GameButton
                variant="primary"
                disabled={exitSaving}
                onClick={() => void exitToHome()}
              >
                {exitSaving ? "기록 저장 중…" : "기록 저장 · 홈으로"}
              </GameButton>
            </div>
          </section>
        </div>
      )}
      {snap.state === "poker" && (
        <PokerModal snap={snap} onExit={requestExitToHome} />
      )}
      {snap.state === "defeat" && (
        <div className="modal-back defeat-back">
          <section className="end-card panel" role="dialog" aria-modal="true">
            <div className="defeat-heading">
              <div className="grade" aria-label={`작전 등급 ${grade}`}>
                {grade}
              </div>
              <div>
                <span className="eyebrow">DEFENSE LINE LOST</span>
                <h2>게이트 함락</h2>
                <p>방어 작전 기록이 전장 랭킹에 저장되었습니다.</p>
              </div>
            </div>
            <div className="defeat-stats">
              <article className="featured">
                <span>처치</span>
                <b>{snap.kills.toLocaleString()}</b>
              </article>
              <article>
                <span>생존 PHASE</span>
                <b>{snap.phase}</b>
              </article>
              <article>
                <span>작전 시간</span>
                <b>{formatPlayTime(snap.elapsed)}</b>
              </article>
              <article>
                <span>총 피해</span>
                <b>{Math.round(snap.totalDamage).toLocaleString()}</b>
              </article>
            </div>
            <div className="defeat-summary">
              <span>최고 기록 <b>{snap.bestKills.toLocaleString()}</b></span>
              <i aria-hidden="true" />
              <span>잔존 유닛 <b>{snap.units}</b></span>
            </div>
            <div className="defeat-actions">
              <GameButton variant="secondary" onClick={() => engine.reset()}>
                전장 선택
              </GameButton>
              <GameButton
                variant="primary"
                onClick={() => {
                  engine.reset();
                  engine.start();
                }}
              >
                다시 도전
              </GameButton>
            </div>
          </section>
        </div>
      )}
      <div className="rotate">
        <b>가로 화면으로 시작</b>
        <span>버튼을 누르면 전체 화면과 가로 모드를 적용합니다.</span>
        <GameButton
          variant="primary"
          className="landscape-start"
          onClick={() => void enterMobileLandscape(shell.current)}
        >
          게임 화면 열기
        </GameButton>
        <small>전환되지 않으면 기기를 가로로 돌려주세요.</small>
      </div>
    </main>
  );
}
