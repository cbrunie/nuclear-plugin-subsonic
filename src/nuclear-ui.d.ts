// Nuclear hands its UI components to plugins at runtime; the package is not
// published, so only what this plugin uses is declared here.
declare module '@nuclearplayer/ui' {
  import type { ButtonHTMLAttributes, FC } from 'react';

  export const Button: FC<
    ButtonHTMLAttributes<HTMLButtonElement> & {
      variant?:
        'default' | 'secondary' | 'tertiary' | 'noShadow' | 'text' | 'ghost';
      size?: 'default' | 'sm' | 'xs' | 'lg' | 'icon' | 'icon-sm' | 'flexible';
    }
  >;
}
