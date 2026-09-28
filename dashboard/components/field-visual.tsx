/** Decorative workspace artwork. It never represents live status or telemetry. */
export function FieldVisual() {
  return <div className="field-visual" aria-hidden="true">
    <span className="field-visual-coordinate">KRYPTON / FIELD</span>
    <svg viewBox="0 0 320 220" fill="none">
      <g className="field-art-orbit" stroke="currentColor">
        <ellipse cx="160" cy="110" rx="121" ry="65" transform="rotate(-24 160 110)" opacity=".4" />
        <ellipse cx="160" cy="110" rx="112" ry="57" transform="rotate(34 160 110)" opacity=".2" />
        <circle cx="160" cy="110" r="85" strokeDasharray="1 9" opacity=".4" />
        <circle cx="160" cy="110" r="42" fill="currentColor" fillOpacity=".07" strokeOpacity=".5" />
        <path d="M 147 96 L 173 96 L 173 122 L 147 122 Z M 160 78 V 91 M 160 127 V 142 M 129 110 H 142 M 178 110 H 192" strokeWidth="2" />
        <circle cx="49" cy="143" r="6" fill="currentColor" stroke="none" /><circle cx="260" cy="67" r="4" fill="currentColor" stroke="none" />
        <path d="M 27 192 H 96 M 27 184 V 200 M 291 26 V 66 M 284 26 H 298" opacity=".35" />
      </g>
      <g className="field-art-spectrum" stroke="currentColor">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => <path key={i} d={`M ${35 + i * 28} 182 V ${104 - Math.sin(i * .65) * 57}`} strokeWidth="11" strokeLinecap="round" opacity={.2 + i * .07} />)}
        <path d="M 27 196 H 300 M 38 40 V 190" opacity=".2" /><path d="M 32 104 C 86 6 118 60 160 61 S 231 191 290 129" strokeWidth="1.5" strokeDasharray="3 6" opacity=".5" />
        <circle cx="160" cy="61" r="7" fill="currentColor" stroke="none" />
      </g>
      <g className="field-art-proof" stroke="currentColor">
        <path d="M 160 31 L 265 88 L 160 147 L 55 88 Z" fill="currentColor" fillOpacity=".08" opacity=".7" />
        <path d="M 55 111 L 160 170 L 265 111 M 55 134 L 160 193 L 265 134" opacity=".4" />
        <path d="M 160 65 L 185 77 V 99 L 160 119 L 135 99 V 77 Z" fill="currentColor" fillOpacity=".08" />
        <path d="M 148 90 L 157 99 L 174 81" strokeWidth="3" />
        <path d="M 160 147 V 193 M 55 88 V 134 M 265 88 V 134" opacity=".15" strokeDasharray="2 5" />
      </g>
      <g className="field-art-pulse" stroke="currentColor">
        <circle cx="160" cy="110" r="80" opacity=".15" /><circle cx="160" cy="110" r="101" strokeDasharray="2 8" opacity=".3" />
        <path d="M 18 110 H 87 L 110 76 L 139 152 L 161 66 L 190 123 L 210 110 H 302" strokeWidth="2" />
        <circle cx="161" cy="66" r="5" fill="currentColor" stroke="none" />
        <path d="M 55 44 H 103 M 218 180 H 275" opacity=".3" />
      </g>
      <g className="field-art-neural" stroke="currentColor">
        <circle className="field-neural-ring" cx="160" cy="110" r="68" strokeDasharray="2 8" />
        <circle className="field-neural-ring" cx="160" cy="110" r="94" strokeDasharray="1 11" />
        <g className="field-neural-links" strokeWidth="1.2">
          <path d="M 44 116 Q 105 75 160 110 M 76 47 Q 121 51 160 110 M 96 177 Q 124 149 160 110 M 160 110 Q 210 53 254 58 M 160 110 Q 224 103 282 116 M 160 110 Q 207 170 250 173" />
          <path d="M 44 116 Q 52 71 76 47 M 44 116 Q 63 169 96 177 M 76 47 Q 171 15 254 58 M 254 58 Q 283 78 282 116 M 282 116 Q 279 156 250 173 M 96 177 Q 174 208 250 173" />
        </g>
        <g className="field-neural-flow" strokeWidth="2" strokeLinecap="round">
          <path d="M 44 116 Q 105 75 160 110 Q 210 53 254 58" />
          <path d="M 96 177 Q 124 149 160 110 Q 224 103 282 116" />
          <path d="M 76 47 Q 121 51 160 110 Q 207 170 250 173" />
        </g>
        <g className="field-neural-nodes">
          {[[44, 116], [76, 47], [96, 177], [254, 58], [282, 116], [250, 173]].map(([cx, cy], index) => <g key={index} className="field-neural-node"><circle cx={cx} cy={cy} r="8" fill="currentColor" fillOpacity=".13" /><circle cx={cx} cy={cy} r="3" fill="currentColor" stroke="none" /></g>)}
        </g>
        <g className="field-neural-core">
          <path d="M 160 77 L 188 94 V 126 L 160 143 L 132 126 V 94 Z" fill="currentColor" fillOpacity=".12" strokeWidth="1.5" />
          <circle cx="160" cy="110" r="17" fill="currentColor" fillOpacity=".08" />
          <path d="M 149 110 H 171 M 160 99 V 121" strokeWidth="1.4" />
          <circle cx="160" cy="110" r="4" fill="currentColor" stroke="none" />
        </g>
      </g>
    </svg>
    <span className="field-visual-caption">A WIDER PERSPECTIVE</span>
  </div>;
}
