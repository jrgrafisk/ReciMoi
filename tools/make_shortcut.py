#!/usr/bin/env python3
"""Bygger iPhone-genvejen ReciMoi som .shortcut-fil (usigneret).

Genvejen står i delemenuen, henter Instagram-siden, finder beskrivelsen (og:description)
og åbner ReciMoi med link + tekst. Signeres bagefter på en Mac, der er logget ind i iCloud:
  shortcuts sign --mode anyone --input ud.shortcut --output ReciMoi.shortcut
Åbn den signerede fil på iPhonen, og del den derefter som iCloud-link.
Brug:  python3 tools/make_shortcut.py ud.shortcut [app-adresse]
"""
import plistlib
import sys
import uuid

APP = sys.argv[2] if len(sys.argv) > 2 else "https://jrgrafisk.github.io/ReciMoi/"
OBJ = "￼"  # pladsholder for en variabel i en tekst


def u16(s):
    return len(s.encode("utf-16-le")) // 2


def token_string(parts):
    """parts: liste af str eller variabel-dicts → WFTextTokenString."""
    text, attachments = "", {}
    for p in parts:
        if isinstance(p, str):
            text += p
        else:
            attachments[f"{{{u16(text)}, 1}}"] = p
            text += OBJ
    return {"Value": {"string": text, "attachmentsByRange": attachments}, "WFSerializationType": "WFTextTokenString"}


def attachment(var):
    return {"Value": var, "WFSerializationType": "WFTextTokenAttachment"}


def output(action_uuid, name):
    return {"Type": "ActionOutput", "OutputUUID": action_uuid, "OutputName": name}


SHORTCUT_INPUT = {"Type": "ExtensionInput"}
ids = {k: str(uuid.uuid4()).upper() for k in ("page", "match", "cap", "link", "text")}

actions = [
    {"WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
     "WFWorkflowActionParameters": {"UUID": ids["page"], "WFURL": token_string([SHORTCUT_INPUT])}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.text.match",
     "WFWorkflowActionParameters": {"UUID": ids["match"], "WFMatchTextPattern": 'og:description" content="([^"]*)"',
                                    "WFMatchTextCaseSensitive": False,
                                    "text": token_string([output(ids["page"], "Contents of URL")])}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.urlencode",
     "WFWorkflowActionParameters": {"UUID": ids["cap"], "WFEncodeMode": "Encode",
                                    "WFInput": token_string([output(ids["match"], "Matches")])}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.urlencode",
     "WFWorkflowActionParameters": {"UUID": ids["link"], "WFEncodeMode": "Encode",
                                    "WFInput": token_string([SHORTCUT_INPUT])}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
     "WFWorkflowActionParameters": {"UUID": ids["text"], "WFTextActionText": token_string([
         APP + "?url=", output(ids["link"], "URL Encoded Text"),
         "&caption=", output(ids["cap"], "URL Encoded Text")])}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.openurl",
     "WFWorkflowActionParameters": {"WFInput": attachment(output(ids["text"], "Text"))}},
]

shortcut = {
    "WFWorkflowClientVersion": "2302.0.4",
    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowIcon": {"WFWorkflowIconStartColor": 431817727, "WFWorkflowIconGlyphNumber": 59511},
    "WFWorkflowImportQuestions": [],
    "WFWorkflowTypes": ["ActionExtension"],
    "WFWorkflowInputContentItemClasses": ["WFURLContentItem"],
    "WFWorkflowOutputContentItemClasses": [],
    "WFWorkflowHasShortcutInputVariables": True,
    "WFQuickActionSurfaces": [],
    "WFWorkflowActions": actions,
}

with open(sys.argv[1], "wb") as f:
    plistlib.dump(shortcut, f, fmt=plistlib.FMT_BINARY)
print("Skrev", sys.argv[1])
