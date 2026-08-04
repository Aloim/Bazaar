shader_type canvas_item;

// How many pixels from the edge the fade starts
uniform float fade_width : hint_range(10.0, 500.0, 1.0) = 200.0;

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    // Distance from each edge in UV space (0..1)
    float left   = UV.x;
    float right  = 1.0 - UV.x;
    float top    = UV.y;
    float bottom = 1.0 - UV.y;
    // Convert fade_width from pixels to UV fraction
    // TEXTURE_PIXEL_SIZE = 1/texture_size
    float fade_u = fade_width * TEXTURE_PIXEL_SIZE.x;
    float fade_v = fade_width * TEXTURE_PIXEL_SIZE.y;
    // Smoothstep from 0 (edge) to 1 (inside fade zone)
    float alpha = smoothstep(0.0, fade_u, left)
                * smoothstep(0.0, fade_u, right)
                * smoothstep(0.0, fade_v, top)
                * smoothstep(0.0, fade_v, bottom);
    COLOR = vec4(tex.rgb, tex.a * alpha);
}
