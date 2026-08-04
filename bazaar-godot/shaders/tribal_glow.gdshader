shader_type canvas_item;
render_mode blend_mix;

// tribal_glow.gdshader — glowing tribal markings for the DappHub owner's
// "red-tribal" skin. Lights up the bright, red-dominant "line" pixels into a
// self-lit emission and wraps the figure in a soft pulsing halo so the markings
// pop against the dim, rusty station. Applied per-sprite by player.gd /
// remote_player.gd ONLY while the red-tribal skin is active (so it's the owner).
//
// The skins are individual 128x128 frames (not an atlas), so offset sampling for
// the halo can't bleed into neighbouring frames. All uniforms are editor-tunable
// via sprite/players/tribal_glow.tres.

uniform vec4  glow_color    : source_color = vec4(1.0, 0.16, 0.10, 1.0); // ember-red
uniform float glow_strength : hint_range(0.0, 6.0) = 2.8;   // emission lift on the lines
uniform float halo_size     : hint_range(0.0, 8.0) = 2.8;   // outer-glow radius (texels)
uniform float halo_strength : hint_range(0.0, 4.0) = 1.9;   // outer-glow intensity
uniform float pulse_speed   : hint_range(0.0, 8.0) = 3.0;
uniform float pulse_depth   : hint_range(0.0, 1.0) = 0.32;  // how much it breathes
uniform float threshold     : hint_range(0.0, 1.0) = 0.16;  // how "red + bright" counts as a line

// Red-dominant brightness of a sampled pixel (0 = not a line, >0 = a glowing line).
float line_lum(vec4 c) {
	float rd = c.r - max(c.g, c.b) * 0.7;
	return max(rd - threshold, 0.0) * c.a;
}

void fragment() {
	vec4 base = texture(TEXTURE, UV);
	vec2 px = TEXTURE_PIXEL_SIZE;

	float self = line_lum(base);

	// 8-direction ring (two radii) → a cheap soft halo from nearby line pixels.
	float halo = 0.0;
	for (int i = 0; i < 8; i++) {
		float a = float(i) * 0.78539816; // 2*PI / 8
		vec2 dir = vec2(cos(a), sin(a)) * px;
		halo += line_lum(texture(TEXTURE, UV + dir * halo_size));
		halo += line_lum(texture(TEXTURE, UV + dir * halo_size * 0.5));
	}
	halo /= 16.0;

	float pulse = (1.0 - pulse_depth) + pulse_depth * (0.5 + 0.5 * sin(TIME * pulse_speed));

	// 1) the sprite, with its markings lit up.
	vec3 col = base.rgb + glow_color.rgb * self * glow_strength * pulse;
	float a = base.a;

	// 2) a soft red halo bleeding out past the silhouette.
	float outer = halo * halo_strength * pulse * (1.0 - base.a);
	col += glow_color.rgb * outer;
	a = clamp(a + outer, 0.0, 1.0);

	COLOR = vec4(col, a);
}
