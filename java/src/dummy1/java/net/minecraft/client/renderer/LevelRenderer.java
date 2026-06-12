package net.minecraft.client.renderer;

public class LevelRenderer {
    public void sayHello() {
        System.out.println("hello world 1");
    }

    public int getRenderDistance() {
        return 12;
    }

    public int getSectionCount() {
        return 4;
    }

    public boolean shouldRenderSky() {
        return true;
    }

    public boolean shouldRenderClouds() {
        return true;
    }

    public boolean shouldRenderWeather() {
        return true;
    }

    public String getRendererName() {
        return "old renderer";
    }
}
