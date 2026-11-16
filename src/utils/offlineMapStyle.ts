import { DARK, LIGHT, layers } from '@protomaps/basemaps';
import type { Flavor } from '@protomaps/basemaps';
import type { StyleSpecification } from 'maplibre-gl';
import type { Lang, Theme } from '../types/transit';

const TETOUAN_LIGHT_FLAVOR: Flavor = {
  ...LIGHT,
  background: '#EAF1F5',
  earth: '#F4F7FA',
  water: '#BDE2F7',
  park_a: '#D6EFE2',
  park_b: '#C2E6D3',
  wood_a: '#D0E9DB',
  wood_b: '#BDE0CD',
  beach: '#F6EED9',
  sand: '#EFE9D9',
  buildings: '#DCE5ED',
  minor_a: '#E6EEF4',
  minor_b: '#FFFFFF',
  minor_casing: '#D5E0E9',
  major: '#FFFFFF',
  major_casing_early: '#CBD8E4',
  major_casing_late: '#CBD8E4',
  highway: '#FCD34D',
  highway_casing_early: '#D97706',
  highway_casing_late: '#D97706',
  city_label: '#041626',
  city_label_halo: '#FFFFFF',
  subplace_label: '#3B566E',
  subplace_label_halo: '#F4F7FA',
  roads_label_major: '#1E3A52',
  roads_label_major_halo: '#FFFFFF',
  roads_label_minor: '#4A657A',
  roads_label_minor_halo: '#FFFFFF',
  ocean_label: '#0155A6',
  regular: 'Noto Sans Regular',
  bold: 'Noto Sans Medium',
  italic: 'Noto Sans Regular',
};

const TETOUAN_DARK_FLAVOR: Flavor = {
  ...DARK,
  background: '#05101C',
  earth: '#081828',
  water: '#0B233C',
  park_a: '#071F1C',
  park_b: '#092823',
  wood_a: '#08211E',
  wood_b: '#0A2925',
  beach: '#182430',
  sand: '#13202D',
  buildings: '#0D2236',
  minor_a: '#10273E',
  minor_b: '#132E49',
  minor_casing: '#061321',
  minor_service: '#10273E',
  minor_service_casing: '#061321',
  major: '#183857',
  major_casing_early: '#081828',
  major_casing_late: '#081828',
  highway: '#1E4970',
  highway_casing_early: '#071524',
  highway_casing_late: '#071524',
  bridges_minor: '#132E49',
  bridges_major: '#183857',
  bridges_highway: '#1E4970',
  tunnel_minor: '#0D2135',
  tunnel_major: '#122B44',
  tunnel_highway: '#163654',
  city_label: '#EFF6FA',
  city_label_halo: '#05101C',
  subplace_label: '#85A3BC',
  subplace_label_halo: '#081828',
  roads_label_major: '#9BB7CA',
  roads_label_major_halo: '#081828',
  roads_label_minor: '#6B8BA5',
  roads_label_minor_halo: '#081828',
  ocean_label: '#38BDF8',
  country_label: '#6B8BA5',
  state_label: '#6B8BA5',
  regular: 'Noto Sans Regular',
  bold: 'Noto Sans Medium',
  italic: 'Noto Sans Regular',
};

export function buildTetouanMapStyle(theme: Theme, lang: Lang): StyleSpecification {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : '';
  const flavor = theme === 'dark' ? TETOUAN_DARK_FLAVOR : TETOUAN_LIGHT_FLAVOR;
  const spriteVariant = theme === 'dark' ? 'dark' : 'light';

  return {
    version: 8,
    glyphs: `${origin}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${origin}/sprites/v4/${spriteVariant}`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${origin}/tiles/tetouan.pmtiles`,
        attribution:
          '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">&copy; OpenStreetMap</a> &middot; <a href="https://protomaps.com" target="_blank" rel="noopener noreferrer">Protomaps</a>',
      },
    },
    layers: layers('protomaps', flavor, { lang }) as StyleSpecification['layers'],
  };
}
