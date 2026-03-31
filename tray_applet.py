import pystray
from PIL import Image, ImageDraw
import requests
import time
import threading
import os

def create_image(color):
    # Generate a simple icon
    width = 64
    height = 64
    image = Image.new('RGB', (width, height), color)
    dc = ImageDraw.Draw(image)
    dc.rectangle((width // 2 - 10, height // 2 - 10, width // 2 + 10, height // 2 + 10), fill='white')
    return image

def on_recover(icon, item):
    try:
        requests.post('http://localhost:3000/api/recover')
        icon.notify("Recovery sequence triggered", "Broadcom Recovery Kit")
    except Exception as e:
        icon.notify(f"Recovery failed: {str(e)}", "Broadcom Recovery Kit")

def on_quit(icon, item):
    icon.stop()

def setup(icon):
    icon.visible = True
    while icon.visible:
        # In a real app, we would poll the health endpoint
        # try:
        #     r = requests.get('http://localhost:3000/api/health')
        #     if r.status_code == 200:
        #         icon.icon = create_image('green')
        #     else:
        #         icon.icon = create_image('red')
        # except:
        #     icon.icon = create_image('gray')
        time.sleep(5)

icon = pystray.Icon("Broadcom Recovery", create_image('orange'), menu=pystray.Menu(
    pystray.MenuItem("Force Recovery", on_recover),
    pystray.MenuItem("Quit", on_quit)
))

if __name__ == "__main__":
    print("Broadcom Tray Applet starting...")
    icon.run(setup)
