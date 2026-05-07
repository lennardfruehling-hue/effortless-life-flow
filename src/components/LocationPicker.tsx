import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2, ExternalLink } from "lucide-react";
import { searchPlaces, PlaceSuggestion, osmEmbedUrl, osmLinkUrl } from "@/lib/geocode";

interface Props {
  value: string;
  onChange: (v: string, coords?: { lat: number; lon: number }) => void;
  knownLocations?: string[];
  placeholder?: string;
  required?: boolean;
}

export default function LocationPicker({ value, onChange, knownLocations = [], placeholder, required }: Props) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Debounced address search via Nominatim
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!value || value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    // Skip search if user just picked a known location matching exactly
    debounceRef.current = window.setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const results = await searchPlaces(value, ctrl.signal);
        setSuggestions(results);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [value]);

  const pickSuggestion = (s: PlaceSuggestion) => {
    setCoords({ lat: s.lat, lon: s.lon });
    setOpen(false);
    setSuggestions([]);
    onChange(s.display, { lat: s.lat, lon: s.lon });
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="relative">
          <MapPin size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            list="task-known-locations"
            value={value}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => {
              setCoords(null);
              onChange(e.target.value);
              setOpen(true);
            }}
            placeholder={placeholder || "Search address or place"}
            className="w-full bg-secondary border border-border rounded pl-8 pr-8 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            required={required}
          />
          {loading && (
            <Loader2 size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
          )}
        </div>
        {knownLocations.length > 0 && (
          <datalist id="task-known-locations">
            {knownLocations.map((loc) => (
              <option key={loc} value={loc} />
            ))}
          </datalist>
        )}
        {open && suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-popover border border-border rounded-md shadow-lg text-sm">
            {suggestions.map((s) => (
              <li key={s.osmId}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickSuggestion(s)}
                  className="w-full text-left px-3 py-2 hover:bg-accent text-foreground flex items-start gap-2"
                >
                  <MapPin size={12} className="mt-0.5 shrink-0 text-cat-d" />
                  <span className="line-clamp-2">{s.display}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {knownLocations.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {knownLocations.slice(0, 8).map((loc) => (
            <button
              key={loc}
              type="button"
              onClick={() => onChange(loc)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                value === loc
                  ? "bg-cat-d/20 text-cat-d border-cat-d/40"
                  : "text-muted-foreground border-border hover:border-cat-d/40 hover:text-cat-d"
              }`}
            >
              {loc}
            </button>
          ))}
        </div>
      )}

      {coords && (
        <div className="rounded-md overflow-hidden border border-border">
          <iframe
            title="Map preview"
            src={osmEmbedUrl(coords.lat, coords.lon)}
            className="w-full h-40 bg-secondary"
            loading="lazy"
          />
          <a
            href={osmLinkUrl(coords.lat, coords.lon)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground bg-secondary/60"
          >
            <ExternalLink size={10} /> Open in OpenStreetMap
          </a>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">
        Address search powered by OpenStreetMap. Pick a result to attach a map preview.
      </p>
    </div>
  );
}
