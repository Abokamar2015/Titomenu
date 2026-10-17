export const IMAGES = {
  COVER: "/images/cover.jpg",
  LOGO: "/images/LOGO.png",
  CROPPED: "/images/cropped_image_0_1777473782186812804.jpg",
} as const;

export type ImageKey = keyof typeof IMAGES;
