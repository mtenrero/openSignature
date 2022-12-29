import { Grid, ThemeIcon } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons";
import { PricingTierCard } from "../components/cards/PricingTierCard";

export default () => {
  return (
    <div>
      <Grid>
        <Grid.Col md={12} lg={4}>
          <PricingTierCard
            title={"Top-Up"}
            description={"The most basic tier for personal & business occasional use"}
            action={{text: "Free Start"}}
            gradient={["blue","cyan"]}
            items={[
              {
                title: "5 templates"
              },
              {
                title: "SMS & e-mail Flows"
              },
              {
                title: "0.50€ / SMS contract"
              },
              {
                title: "0.20€ / e-mail contract"
              },
              {
                title: "Top-Up wallet",
                icon: <ThemeIcon color="orange" size={24} radius="xl">
                        <IconAlertCircle size={16} />
                      </ThemeIcon>
              },
              {
                title: "No API access",
                icon: <ThemeIcon color="orange" size={24} radius="xl">
                        <IconAlertCircle size={16} />
                      </ThemeIcon>
              }
            ]}
          />
        </Grid.Col>
        <Grid.Col md={12} lg={4}>
          <PricingTierCard
            title={"Small Business"}
            description={"Small Business usage with extended support, included contract sends allowance per month, and reduced pricing for following sends"}
            action={{text: "12 € / month"}}
            gradient={["yellow","red"]}
            items={[
              {
                title: "20 templates"
              },
              {
                title: "SMS & e-mail Flows"
              },
              {
                title: "40 SMS contracts included"
              },
              {
                title: "80 e-mail contracts included"
              },
              {
                title: "0.40€ / additional SMS contract"
              },
              {
                title: "0.15€ / additional e-mail contract"
              },
              {
                title: "Enhanced Signature verification with OTP + 0.06€ / OTP code (coming soon)"
              },
              {
                title: "API access"
              },
              {
                title: "Extended support service"
              },
              {
                title: "Top-Up wallet",
                icon: <ThemeIcon color="orange" size={24} radius="xl">
                        <IconAlertCircle size={16} />
                      </ThemeIcon>
              },
            ]}
          />
        </Grid.Col>
        <Grid.Col md={12} lg={4}>
          <PricingTierCard
            title={"Business"}
            description={"The most basic tier for small business and occasional use"}
            action={{text: "50 € / month"}}
            gradient={["green","darkgreen"]}
            items={[
              {
                title: "Unlimited templates"
              },
              {
                title: "SMS & e-mail Flows"
              },
              {
                title: "200 SMS contracts included"
              },
              {
                title: "400 e-mail contracts included"
              },
              {
                title: "0.25€ / additional SMS contract"
              },
              {
                title: "0.10€ / additional e-mail contract"
              },
              {
                title: "Enhanced Signature verification with OTP + 0.06€ / OTP code (coming soon)"
              },
              {
                title: "API access"
              },
              {
                title: "Extended API on-demand"
              },
              {
                title: "Extended support service"
              },
              {
                title: "Pay by SEPA mandate / Wire Transfer at the end of the month"
              },
            ]}
          />
        </Grid.Col>
      </Grid>
    </div>
  );
}