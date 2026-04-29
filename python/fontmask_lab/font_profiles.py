from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class FontProfile:
    """
    Describes a realistic user font environment for fingerprint experiments.

    :param name: short identifier used in file names and chart labels.
    :param description: human-readable summary of the font pack.
    :param probe_families: CSS font-family strings to measure with canvas measureText.
    :param check_families: font names to probe via document.fonts.check().
    """

    name: str
    description: str
    probe_families: list[str]
    check_families: list[str]

    @property
    def probe_count(self) -> int:
        return len(self.probe_families)

    @property
    def total_dimensions(self) -> int:
        return len(self.probe_families) + len(self.check_families)


_SAMPLE_TEXT = "fontmaskABCDEFGHIJ"
_SAMPLE_MIXED = "The quick ƒΩ 1234"

FONT_PROFILES: dict[str, FontProfile] = {
    "windows_base": FontProfile(
        name="windows_base",
        description="Factory Windows 11 — only the 3 default probes",
        probe_families=[
            "system-ui",
            '"Segoe UI"',
            '"Georgia", serif',
        ],
        check_families=[
            "Arial",
            "Tahoma",
            "Verdana",
            "Trebuchet MS",
            "Courier New",
        ],
    ),
    "office_pack": FontProfile(
        name="office_pack",
        description="Windows + Microsoft Office font pack (Calibri, Cambria, Candara…)",
        probe_families=[
            "system-ui",
            '"Segoe UI"',
            '"Georgia", serif',
            "Calibri",
            "Cambria",
            '"Candara"',
        ],
        check_families=[
            "Arial",
            "Tahoma",
            "Verdana",
            "Calibri",
            "Cambria",
            "Candara",
            "Constantia",
            "Corbel",
            "Consolas",
            "Colonna MT",
        ],
    ),
    "developer": FontProfile(
        name="developer",
        description="Dev machine — coding fonts (Cascadia Code, Lucida Console, Consolas)",
        probe_families=[
            "system-ui",
            '"Segoe UI"',
            '"Georgia", serif',
            '"Cascadia Code", monospace',
            '"Lucida Console", monospace',
            "Consolas",
        ],
        check_families=[
            "Arial",
            "Tahoma",
            "Cascadia Code",
            "Cascadia Mono",
            "Lucida Console",
            "Consolas",
            "DejaVu Sans Mono",
            "Courier New",
            "Calibri",
        ],
    ),
    "heavy": FontProfile(
        name="heavy",
        description="Power user — large installed font library (Office + creative + dev fonts)",
        probe_families=[
            "system-ui",
            '"Segoe UI"',
            '"Georgia", serif',
            "Calibri",
            "Cambria",
            '"Gill Sans MT"',
            '"Garamond"',
            '"Book Antiqua"',
            '"Cascadia Code", monospace',
            '"Palatino Linotype"',
            '"Trebuchet MS"',
            '"Franklin Gothic Medium"',
        ],
        check_families=[
            "Arial",
            "Tahoma",
            "Verdana",
            "Calibri",
            "Cambria",
            "Candara",
            "Constantia",
            "Corbel",
            "Consolas",
            "Cascadia Code",
            "Lucida Console",
            "Gill Sans MT",
            "Garamond",
            "Book Antiqua",
            "Palatino Linotype",
            "Trebuchet MS",
            "Franklin Gothic Medium",
            "Century Gothic",
            "Baskerville Old Face",
            "Bodoni MT",
        ],
    ),
}

DEFAULT_PROFILE = FONT_PROFILES["windows_base"]


def get_profile(name: str) -> FontProfile:
    """
    :param name: profile identifier.
    :returns: FontProfile for that name.
    :raises KeyError: if name not found.
    """
    if name not in FONT_PROFILES:
        raise KeyError(f"Unknown font profile {name!r}. Available: {list(FONT_PROFILES)}")
    return FONT_PROFILES[name]
