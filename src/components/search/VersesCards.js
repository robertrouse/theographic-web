import React from 'react';
import Grid from '@material-ui/core/Grid';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import Typography from '@material-ui/core/Typography';

class VersesCards extends React.Component {

    render() {

        return (
            <Grid container 
            spacing={2}
            direction="column"
        >
                <Grid item>Verses</Grid>
                {this.props.verses.map(verse => {
                    // startEndArray = verse.verseText.split(this.props.query);
                    return (
                        <Grid item>
                            <Card key={"container" + verse.verseId}>
                                <CardContent>
                                    <Typography>{verse.fullRef}</Typography>
                                    <Typography>{verse.verseText}</Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                    )
                })}
            </Grid>
        );
    }
}

export default VersesCards