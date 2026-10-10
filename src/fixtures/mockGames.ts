import { Game, SourceKind, GameStatus, LaunchAction, ArtworkAsset } from '../types/models';

function createSvgCover(title: string, color1: string, color2: string, accent: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" width="600" height="900">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${color1}" />
        <stop offset="100%" stop-color="${color2}" />
      </linearGradient>
      <linearGradient id="acc" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.8" />
        <stop offset="100%" stop-color="${accent}" stop-opacity="0.2" />
      </linearGradient>
    </defs>
    <rect width="600" height="900" fill="url(#bg)" />
    <circle cx="300" cy="380" r="160" fill="url(#acc)" />
    <path d="M 100 650 L 500 650 L 300 350 Z" fill="${accent}" fill-opacity="0.15" />
    <rect x="50" y="800" width="500" height="4" fill="${accent}" rx="2" />
    <text x="300" y="760" font-family="system-ui, sans-serif" font-size="28" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="2">${title.length > 24 ? title.slice(0, 22) + '...' : title}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildMockGames(): Game[] {
  const titles = [
    { title: 'Risk of Rain 2', dev: 'Hopoo Games', year: 2020, source: 'Steam' as SourceKind, hasArt: true, c1: '#1e1b4b', c2: '#312e81', acc: '#818cf8' },
    { title: 'Chrono Trigger', dev: 'Square', year: 1995, source: 'Emulated' as SourceKind, hasArt: true, c1: '#431407', c2: '#7c2d12', acc: '#fb923c' },
    { title: 'CRUMB Circuit Simulator', dev: 'Mike Tang', year: 2022, source: 'Standalone' as SourceKind, hasArt: false },
    { title: 'Hollow Knight: Silksong', dev: 'Team Cherry', year: 2025, source: 'Steam' as SourceKind, hasArt: true, c1: '#18181b', c2: '#27272a', acc: '#f43f5e', missing: true },
    { title: 'Shin Megami Tensei: Persona 3 FES - The Journey & The Answer Deluxe Extended Edition', dev: 'Atlus Creative Team / P-Studio Development Group', year: 2007, source: 'Emulated' as SourceKind, hasArt: true, c1: '#082f49', c2: '#0c4a6e', acc: '#38bdf8' },
    { title: 'Balatro', dev: 'LocalThunk', year: 2024, source: 'Steam' as SourceKind, hasArt: true, c1: '#450a0a', c2: '#7f1d1d', acc: '#ef4444' },
    { title: 'Hades II', dev: 'Supergiant Games', year: 2024, source: 'Steam' as SourceKind, hasArt: true, c1: '#14532d', c2: '#166534', acc: '#22c55e' },
    { title: 'Celeste', dev: 'Maddy Makes Games', year: 2018, source: 'Steam' as SourceKind, hasArt: false },
    { title: 'Portal 2', dev: 'Valve', year: 2011, source: 'Steam' as SourceKind, hasArt: true, c1: '#0f172a', c2: '#1e293b', acc: '#38bdf8' },
    { title: 'Elden Ring', dev: 'FromSoftware Inc.', year: 2022, source: 'Steam' as SourceKind, hasArt: true, c1: '#2e1065', c2: '#3b0764', acc: '#eab308' },
    { title: 'Half-Life 2', dev: 'Valve Corporation', year: 2004, source: 'Steam' as SourceKind, hasArt: false },
    { title: 'Super Mario 64', dev: 'Nintendo EAD', year: 1996, source: 'Emulated' as SourceKind, hasArt: true, c1: '#7f1d1d', c2: '#991b1b', acc: '#3b82f6' },
    { title: 'The Legend of Zelda: Ocarina of Time', dev: 'Nintendo EAD', year: 1998, source: 'Emulated' as SourceKind, hasArt: true, c1: '#064e3b', c2: '#065f46', acc: '#10b981' },
    { title: 'Metroid Prime', dev: 'Retro Studios', year: 2002, source: 'Emulated' as SourceKind, hasArt: false },
    { title: 'Castlevania: Symphony of the Night', dev: 'Konami Computer Entertainment Tokyo', year: 1997, source: 'Emulated' as SourceKind, hasArt: true, c1: '#3b0764', c2: '#581c87', acc: '#c084fc' },
    { title: 'Silent Hill 2 Enhanced Edition', dev: 'Team Silent / SH2:EE Community Enhancement Project', year: 2001, source: 'Standalone' as SourceKind, hasArt: true, c1: '#1c1917', c2: '#292524', acc: '#a8a29e' },
    { title: 'Vampire Survivors', dev: 'poncle', year: 2022, source: 'Steam' as SourceKind, hasArt: false },
    { title: 'Slay the Spire', dev: 'Mega Crit Games', year: 2019, source: 'Steam' as SourceKind, hasArt: true, c1: '#4c0519', c2: '#831843', acc: '#fb7185' },
    { title: 'Cyberpunk 2077', dev: 'CD PROJEKT RED', year: 2020, source: 'Steam' as SourceKind, hasArt: true, c1: '#422006', c2: '#713f12', acc: '#facc15' },
    { title: 'The Witcher 3: Wild Hunt - Complete Edition', dev: 'CD PROJEKT RED', year: 2015, source: 'Steam' as SourceKind, hasArt: false },
    { title: 'Grand Theft Auto: San Andreas', dev: 'Rockstar North', year: 2004, source: 'Standalone' as SourceKind, hasArt: true, c1: '#14532d', c2: '#15803d', acc: '#4ade80' },
    { title: 'Metal Gear Solid 3: Snake Eater', dev: 'Konami Computer Entertainment Japan', year: 2004, source: 'Emulated' as SourceKind, hasArt: true, c1: '#1c1917', c2: '#292524', acc: '#84cc16' },
    { title: 'Pokemon Emerald Version', dev: 'Game Freak', year: 2004, source: 'Emulated' as SourceKind, hasArt: false },
    { title: 'Super Metroid', dev: 'Nintendo R&D1', year: 1994, source: 'Emulated' as SourceKind, hasArt: true, c1: '#1e1b4b', c2: '#312e81', acc: '#f43f5e' },
    { title: 'Dead Cells', dev: 'Motion Twin / Evil Empire', year: 2018, source: 'Steam' as SourceKind, hasArt: true, c1: '#431407', c2: '#7c2d12', acc: '#f97316' },
    { title: 'Disco Elysium - The Final Cut', dev: 'ZA/UM', year: 2019, source: 'Steam' as SourceKind, hasArt: false },
    { title: 'Outer Wilds', dev: 'Mobius Digital', year: 2019, source: 'Steam' as SourceKind, hasArt: true, c1: '#042f2e', c2: '#115e59', acc: '#2dd4bf' },
    { title: 'Tunic', dev: 'TUNIC Team / Andrew Shouldice', year: 2022, source: 'Steam' as SourceKind, hasArt: true, c1: '#14532d', c2: '#166534', acc: '#a3e635' },
    { title: 'Animal Crossing: Wild World', dev: 'Nintendo EAD', year: 2005, source: 'Emulated' as SourceKind, hasArt: false },
    { title: 'Tetris Effect: Connected', dev: 'Monstars Inc. / Resonair', year: 2020, source: 'Steam' as SourceKind, hasArt: true, c1: '#172554', c2: '#1e40af', acc: '#60a5fa' },
    { title: 'Factorio', dev: 'Wube Software LTD.', year: 2020, source: 'Steam' as SourceKind, hasArt: false },
    { title: 'Stardew Valley', dev: 'ConcernedApe', year: 2016, source: 'Steam' as SourceKind, hasArt: true, c1: '#14532d', c2: '#15803d', acc: '#86efac' },
    { title: 'Terraria', dev: 'Re-Logic', year: 2011, source: 'Steam' as SourceKind, hasArt: false },
    { title: 'Subnautica', dev: 'Unknown Worlds Entertainment', year: 2018, source: 'Steam' as SourceKind, hasArt: true, c1: '#082f49', c2: '#075985', acc: '#38bdf8' },
    { title: 'Dwarf Fortress', dev: 'Bay 12 Games', year: 2022, source: 'Steam' as SourceKind, hasArt: false },
    { title: 'Grim Dawn', dev: 'Crate Entertainment', year: 2016, source: 'Steam' as SourceKind, hasArt: true, c1: '#450a0a', c2: '#7f1d1d', acc: '#f87171' },
    { title: 'Diablo II: Lord of Destruction', dev: 'Blizzard North', year: 2001, source: 'Standalone' as SourceKind, hasArt: true, c1: '#3b0764', c2: '#581c87', acc: '#e879f9' },
    { title: 'RollerCoaster Tycoon 2: Triple Thrill Pack', dev: 'Chris Sawyer Productions', year: 2002, source: 'Standalone' as SourceKind, hasArt: false },
    { title: 'Deus Ex: Game of the Year Edition', dev: 'Ion Storm', year: 2000, source: 'Shortcut' as SourceKind, hasArt: true, c1: '#1e293b', c2: '#334155', acc: '#e2e8f0' },
    { title: 'System Shock 2', dev: 'Irrational Games / Looking Glass Studios', year: 1999, source: 'Shortcut' as SourceKind, hasArt: false },
    { title: 'Thief II: The Metal Age', dev: 'Looking Glass Studios', year: 2000, source: 'Shortcut' as SourceKind, hasArt: true, c1: '#0f172a', c2: '#1e293b', acc: '#94a3b8' },
    { title: 'Fallout: New Vegas', dev: 'Obsidian Entertainment', year: 2010, source: 'Steam' as SourceKind, hasArt: true, c1: '#422006', c2: '#713f12', acc: '#f59e0b' },
    { title: 'The Elder Scrolls III: Morrowind Game of the Year Edition', dev: 'Bethesda Game Studios', year: 2002, source: 'Standalone' as SourceKind, hasArt: false },
    { title: 'DOOM (1993)', dev: 'id Software', year: 1993, source: 'Manual' as SourceKind, hasArt: true, c1: '#450a0a', c2: '#991b1b', acc: '#ef4444' },
    { title: 'Quake', dev: 'id Software', year: 1996, source: 'Manual' as SourceKind, hasArt: false },
    { title: 'Unreal Tournament 2004', dev: 'Epic Games / Digital Extremes', year: 2004, source: 'Standalone' as SourceKind, hasArt: true, c1: '#1e1b4b', c2: '#3730a3', acc: '#a5b4fc' },
    { title: 'Star Wars: Knights of the Old Republic', dev: 'BioWare', year: 2003, source: 'Steam' as SourceKind, hasArt: true, c1: '#1e293b', c2: '#475569', acc: '#38bdf8' },
    { title: 'Mass Effect Legendary Edition', dev: 'BioWare', year: 2021, source: 'Steam' as SourceKind, hasArt: false },
    { title: 'XCOM: Enemy Unknown', dev: 'Firaxis Games', year: 2012, source: 'Steam' as SourceKind, hasArt: true, c1: '#022c22', c2: '#064e3b', acc: '#34d399' },
    { title: 'Civilization IV', dev: 'Firaxis Games', year: 2005, source: 'Steam' as SourceKind, hasArt: false },
    { title: 'Age of Empires II: Definitive Edition', dev: 'Forgotten Empires / Tantalus Media', year: 2019, source: 'Steam' as SourceKind, hasArt: true, c1: '#451a03', c2: '#78350f', acc: '#d97706' },
    { title: 'Heroes of Might and Magic III: Complete', dev: 'New World Computing', year: 1999, source: 'Standalone' as SourceKind, hasArt: true, c1: '#3b0764', c2: '#6b21a8', acc: '#d8b4fe' },
    { title: 'Baldur’s Gate 3', dev: 'Larian Studios', year: 2023, source: 'Steam' as SourceKind, hasArt: false },
    { title: 'Divinity: Original Sin 2 - Definitive Edition', dev: 'Larian Studios', year: 2017, source: 'Steam' as SourceKind, hasArt: true, c1: '#172554', c2: '#1d4ed8', acc: '#93c5fd' },
    { title: 'Path of Exile', dev: 'Grinding Gear Games', year: 2013, source: 'Steam' as SourceKind, hasArt: false },
    { title: 'Guild Wars 2', dev: 'ArenaNet', year: 2012, source: 'Standalone' as SourceKind, hasArt: true, c1: '#450a0a', c2: '#991b1b', acc: '#fca5a5' },
    { title: 'World of Warcraft: Classic', dev: 'Blizzard Entertainment', year: 2004, source: 'Shortcut' as SourceKind, hasArt: false },
    { title: 'Final Fantasy VII', dev: 'Square', year: 1997, source: 'Emulated' as SourceKind, hasArt: true, c1: '#042f2e', c2: '#134e4a', acc: '#5eead4' },
    { title: 'Kingdom Hearts II Final Mix', dev: 'Square Enix Product Development Division 1', year: 2007, source: 'Emulated' as SourceKind, hasArt: false },
    { title: 'Shadow of the Colossus', dev: 'Team Ico / SCE Japan Studio', year: 2005, source: 'Emulated' as SourceKind, hasArt: true, c1: '#1c1917', c2: '#44403c', acc: '#a8a29e' },
    { title: 'God of War II', dev: 'Santa Monica Studio', year: 2007, source: 'Emulated' as SourceKind, hasArt: true, c1: '#450a0a', c2: '#7f1d1d', acc: '#ef4444' },
    { title: 'Resident Evil 4 (2005)', dev: 'Capcom Production Studio 4', year: 2005, source: 'Standalone' as SourceKind, hasArt: false },
  ];

  return titles.map((item, idx) => {
    const id = `mock-game-${(idx + 1).toString().padStart(4, '0')}`;
    const isMissing = Boolean(item.missing) || idx === 11 || idx === 37;
    const isFavorite = idx === 0 || idx === 1 || idx === 5 || idx === 9 || idx === 18 || idx === 27;
    const isHidden = idx === 61;
    const playtimeSeconds = idx % 5 === 0 ? (idx * 3600 + 1800) : idx % 3 === 0 ? (idx * 1200 + 45) : 0;
    const sessionCount = playtimeSeconds > 0 ? Math.max(1, Math.floor(playtimeSeconds / 1800)) : 0;
    const lastPlayed = playtimeSeconds > 0 ? new Date(Date.now() - (idx * 86400000 * 2)).toISOString() : null;

    let launchAction: LaunchAction;
    if (isMissing) {
      launchAction = { type: 'Unavailable', reason: 'Game installation directory not found' };
    } else if (item.source === 'Steam') {
      launchAction = { type: 'Steam', app_id: 100000 + idx };
    } else if (item.source === 'Emulated') {
      launchAction = {
        type: 'EmulatedGame',
        profile_id: 'retroarch',
        rom_path: `C:/Games/Emulation/ROMs/${item.title}.iso`,
      };
    } else if (item.source === 'Shortcut') {
      launchAction = {
        type: 'Shortcut',
        target: `C:/Games/${item.title}/${item.title}.lnk`,
        args: [],
      };
    } else {
      launchAction = {
        type: 'Executable',
        path: `C:/Games/${item.title}/${item.title}.exe`,
        args: [],
      };
    }

    const artwork: Partial<Record<'cover', ArtworkAsset>> = {};
    if (item.hasArt && item.c1 && item.c2 && item.acc) {
      artwork.cover = {
        id: `mock-art-${idx}`,
        game_id: id,
        role: 'cover',
        provider: 'mock',
        source_url: createSvgCover(item.title, item.c1, item.c2, item.acc),
        cached_path: null,
        is_selected: true,
      };
    }

    return {
      id,
      title: item.title,
      sort_title: item.title.toLowerCase().replace(/^(the|a|an)\s+/, ''),
      description: `A collection classic titled ${item.title}.`,
      developer: item.dev,
      publisher: item.dev,
      release_year: item.year,
      genres: ['Action', 'Adventure'],
      tags: ['Classic', 'PC'],
      source_kind: item.source,
      source_id: item.source === 'Steam' ? (100000 + idx).toString() : null,
      install_dir: `C:/Games/${item.title}`,
      launch_action: launchAction,
      status: (isMissing ? 'Missing' : 'Installed') as GameStatus,
      is_favorite: isFavorite,
      is_hidden: isHidden,
      notes: idx % 7 === 0 ? 'Custom player notes recorded.' : null,
      user_tags: isFavorite ? ['Favorites'] : [],
      match_confidence: 0.95,
      provider_attribution: item.source === 'Steam' ? 'Steam Manifest' : 'Local Scanner',
      last_launched_at: lastPlayed,
      last_played_at: lastPlayed,
      playtime_seconds: playtimeSeconds,
      session_count: sessionCount,
      artwork: Object.keys(artwork).length > 0 ? artwork : undefined,
    };
  });
}

export const DEV_MOCK_GAMES: Game[] = import.meta.env.DEV ? buildMockGames() : [];
