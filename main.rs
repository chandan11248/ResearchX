//! Rotating ASCII torus for a ratatui app, with a hidden warp-speed surprise.
//!
//! Controls: `s`, space, or enter triggers the surprise. `q` or `esc` quits.
//!
//! The interesting bits to lift into your own app are `App` and its
//! `render_donut` / `render_warp` / `tick` methods — they just return a
//! `String` each frame, so you can drop that into any widget you like.

use std::time::{Duration, Instant};

use crossterm::event::{self, Event, KeyCode, KeyEventKind};
use ratatui::layout::Alignment;
use ratatui::style::{Color, Style};
use ratatui::widgets::{Block, Borders, Paragraph};
use ratatui::Frame;

const COLS: usize = 80;
const ROWS: usize = 22;
const R1: f64 = 1.0;
const R2: f64 = 2.0;
const K2: f64 = 5.0;
const THETA_STEP: f64 = 0.07;
const PHI_STEP: f64 = 0.02;
const LUMINANCE: &[u8] = b".,-~:;=!*#$@";
const MAX_WARP_FRAMES: u32 = 70;
const TICK: Duration = Duration::from_millis(50);

enum Mode {
    Donut,
    Warp,
}

struct Star {
    angle: f64,
    radius: f64,
    speed: f64,
}

/// Tiny xorshift64 PRNG so the example has zero extra dependencies.
/// Good enough for a star field; not for anything security-related.
struct Rng(u64);

impl Rng {
    fn new() -> Self {
        let seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .subsec_nanos() as u64;
        Self(seed | 1)
    }

    fn next_f64(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 >> 11) as f64 / (1u64 << 53) as f64
    }
}

struct App {
    a: f64,
    b: f64,
    mode: Mode,
    warp_frames: u32,
    stars: Vec<Star>,
    caption: &'static str,
    rng: Rng,
}

impl App {
    fn new() -> Self {
        Self {
            a: 1.0,
            b: 1.0,
            mode: Mode::Donut,
            warp_frames: 0,
            stars: Vec::new(),
            caption: "torus.render()",
            rng: Rng::new(),
        }
    }

    fn trigger_surprise(&mut self) {
        if !matches!(self.mode, Mode::Donut) {
            return;
        }
        self.mode = Mode::Warp;
        self.warp_frames = 0;
        self.caption = "entering warp speed...";
        self.stars.clear();
        for _ in 0..200 {
            self.stars.push(Star {
                angle: self.rng.next_f64() * std::f64::consts::TAU,
                radius: self.rng.next_f64(),
                speed: 0.5 + self.rng.next_f64(),
            });
        }
    }

    fn tick(&mut self) -> String {
        match self.mode {
            Mode::Donut => self.render_donut(),
            Mode::Warp => self.render_warp(),
        }
    }

    /// Classic rotating-torus renderer: project a torus parametrized by
    /// (theta, phi) through two rotations, z-buffer it, and shade each
    /// visible cell by how much its surface normal faces the light.
    fn render_donut(&mut self) -> String {
        let mut buffer = vec![b' '; COLS * ROWS];
        let mut zbuffer = vec![0.0_f64; COLS * ROWS];
        let (sin_a, cos_a) = self.a.sin_cos();
        let (sin_b, cos_b) = self.b.sin_cos();
        let k1 = COLS as f64 * K2 * 3.0 / (8.0 * (R1 + R2));

        let mut theta = 0.0_f64;
        while theta < std::f64::consts::TAU {
            let (sin_t, cos_t) = theta.sin_cos();
            let circle_x = R2 + R1 * cos_t;
            let circle_y = R1 * sin_t;

            let mut phi = 0.0_f64;
            while phi < std::f64::consts::TAU {
                let (sin_p, cos_p) = phi.sin_cos();

                let x = circle_x * (cos_b * cos_p + sin_a * sin_b * sin_p) - circle_y * cos_a * sin_b;
                let y = circle_x * (sin_b * cos_p - sin_a * cos_b * sin_p) + circle_y * cos_a * cos_b;
                let z = K2 + cos_a * circle_x * sin_p + circle_y * sin_a;
                let ooz = 1.0 / z;

                let xp = (COLS as f64 / 2.0 + k1 * ooz * x) as isize;
                let yp = (ROWS as f64 / 2.0 - k1 * ooz * y) as isize;

                let l = cos_p * cos_t * sin_b - cos_a * cos_t * sin_p - sin_a * sin_t
                    + cos_b * (cos_a * sin_t - cos_t * sin_a * sin_p);

                if xp >= 0 && xp < COLS as isize && yp >= 0 && yp < ROWS as isize {
                    let idx = xp as usize + yp as usize * COLS;
                    if ooz > zbuffer[idx] {
                        zbuffer[idx] = ooz;
                        let lum = (l * 8.0) as isize;
                        buffer[idx] = if lum > 0 {
                            LUMINANCE[(lum as usize).min(LUMINANCE.len() - 1)]
                        } else {
                            b' '
                        };
                    }
                }
                phi += PHI_STEP;
            }
            theta += THETA_STEP;
        }

        self.a += 0.04;
        self.b += 0.02;
        buffer_to_string(&buffer)
    }

    /// Radial star burst: each star grows outward from the centre and
    /// respawns once it passes the edge of the grid.
    fn render_warp(&mut self) -> String {
        let mut buffer = vec![b' '; COLS * ROWS];
        let cx = COLS as f64 / 2.0;
        let cy = ROWS as f64 / 2.0;

        for star in self.stars.iter_mut() {
            star.radius += star.speed * 0.03;
            if star.radius > 1.0 {
                star.radius = 0.0;
                star.angle = self.rng.next_f64() * std::f64::consts::TAU;
            }
            let xp = (cx + star.angle.cos() * star.radius * 39.0) as isize;
            let yp = (cy + star.angle.sin() * star.radius * 10.0) as isize;
            if xp >= 0 && xp < COLS as isize && yp >= 0 && yp < ROWS as isize {
                let ch = if star.radius > 0.66 {
                    b'@'
                } else if star.radius > 0.33 {
                    b'*'
                } else {
                    b'.'
                };
                buffer[xp as usize + yp as usize * COLS] = ch;
            }
        }

        self.warp_frames += 1;
        if self.warp_frames >= MAX_WARP_FRAMES {
            self.mode = Mode::Donut;
            self.caption = "torus.render()";
        }
        buffer_to_string(&buffer)
    }
}

fn buffer_to_string(buffer: &[u8]) -> String {
    buffer
        .chunks(COLS)
        .map(|row| String::from_utf8_lossy(row).into_owned())
        .collect::<Vec<_>>()
        .join("\n")
}

fn draw(frame: &mut Frame, app: &App, ascii: &str) {
    let block = Block::default()
        .borders(Borders::ALL)
        .title(app.caption)
        .title_alignment(Alignment::Center);
    let paragraph = Paragraph::new(ascii)
        .style(Style::default().fg(Color::Cyan))
        .alignment(Alignment::Center)
        .block(block);
    frame.render_widget(paragraph, frame.area());
}

fn main() -> std::io::Result<()> {
    ratatui::run(|mut terminal| {
        let mut app = App::new();
        let mut last_tick = Instant::now();
        let mut ascii = app.tick();

        loop {
            terminal.draw(|frame| draw(frame, &app, &ascii))?;

            let timeout = TICK.saturating_sub(last_tick.elapsed());
            if event::poll(timeout)? {
                if let Event::Key(key) = event::read()? {
                    if key.kind == KeyEventKind::Press {
                        match key.code {
                            KeyCode::Char('q') | KeyCode::Esc => break Ok(()),
                            KeyCode::Char('s') | KeyCode::Enter | KeyCode::Char(' ') => {
                                app.trigger_surprise()
                            }
                            _ => {}
                        }
                    }
                }
            }

            if last_tick.elapsed() >= TICK {
                ascii = app.tick();
                last_tick = Instant::now();
            }
        }
    })
}
