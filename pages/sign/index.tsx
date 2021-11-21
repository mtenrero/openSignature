import { Card, CardHeader, CardBody, CardFooter, Button, CheckBox, ResponsiveContext, Heading, Paragraph, Box } from "grommet";
import { margin } from "polished";
import React from "react";

export default function SignDocument(props: any) {
    const size = React.useContext(ResponsiveContext);
    return(
        <Box margin={{bottom: "10px"}}>
            <Heading textAlign="center">Contract Name</Heading>
            <Card alignSelf="center" height={size} width={{min: "60%", max: "90%"}} background="light-1">
                <CardBody pad={size} style={{textAlign: "justify"}}>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut
                    labore et dolore magna aliqua.
                
                </CardBody>
                <CardFooter background="light-2">
                    <CheckBox
                        label="I accept the terms of this contract"
                    />
                    <Button primary margin="5px" hoverIndicator label="Sign" />
                </CardFooter>
            </Card>
        </Box>
    )
}