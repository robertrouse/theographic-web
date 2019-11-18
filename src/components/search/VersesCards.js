import React from 'react';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import Typography from '@material-ui/core/Typography';

class VersesCards extends React.Component {

    render() {

        return (
            <div>
                <div>Verses</div>
                {this.props.verses.map(verse => {
                    // startEndArray = verse.verseText.split(this.props.query);
                    return (
                        <Card key={"container" + verse.verseId}>
                            <CardContent>
                                <Typography>{verse.fullRef}</Typography>
                                <Typography>{verse.verseText}</Typography>
                                    {/*
                                        <TextBold style={{ display: 'inline' }} text={" " + this.props.query + " "}></TextBold>
                                        <TextRegular style={{ display: 'inline' }} text={startEndArray[1]}></TextRegular>
                                    */}
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        );
    }
}

export default VersesCards