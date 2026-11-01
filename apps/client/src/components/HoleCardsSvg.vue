<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: 'sm' | 'md';
  }>(),
  {
    size: 'sm',
  },
);
</script>

<template>
  <span
    aria-hidden="true"
    class="inline-flex items-center select-none"
    :class="size === 'md' ? 'h-8 w-11' : 'h-6 w-8'"
  >
    <svg
      viewBox="0 0 44 32"
      class="h-full w-full overflow-visible drop-shadow"
    >
      <!-- Left hole card (tilted -8 deg) -->
      <g transform="translate(2, 2) rotate(-8 11 14)">
        <rect
          x="0"
          y="0"
          width="20"
          height="27"
          rx="3"
          fill="#0f172a"
          stroke="#f8fafc"
          stroke-width="1.4"
        />
        <rect
          x="2.2"
          y="2.2"
          width="15.6"
          height="22.6"
          rx="1.8"
          fill="#991b1b"
          stroke="#fca5a5"
          stroke-width="0.6"
          stroke-dasharray="1.5 1"
        />
        <path
          d="M10 8 L13.5 13.5 L10 19 L6.5 13.5 Z"
          fill="#fecaca"
          fill-opacity="0.45"
        />
      </g>

      <!-- Right hole card (tilted +9 deg) -->
      <g transform="translate(18, 2) rotate(9 11 14)">
        <rect
          x="0"
          y="0"
          width="20"
          height="27"
          rx="3"
          fill="#0f172a"
          stroke="#f8fafc"
          stroke-width="1.4"
        />
        <rect
          x="2.2"
          y="2.2"
          width="15.6"
          height="22.6"
          rx="1.8"
          fill="#b91c1c"
          stroke="#fca5a5"
          stroke-width="0.6"
          stroke-dasharray="1.5 1"
        />
        <path
          d="M10 8 L13.5 13.5 L10 19 L6.5 13.5 Z"
          fill="#fef2f2"
          fill-opacity="0.55"
        />
      </g>
    </svg>
  </span>
</template>
